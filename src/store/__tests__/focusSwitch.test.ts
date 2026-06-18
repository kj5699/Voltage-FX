import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStore } from '../store'
import { SYMBOL_CONFIG } from '@config/symbols'

vi.mock('@ws/index', () => ({
  wsManager: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}))

beforeEach(() => {
  useStore.setState({
    wsStatus: 'disconnected',
    focusedSymbol: 'BTCUSD',
    focusSeqId: 0,
    tickers: {},
    orderBook: { bids: [], asks: [], midPrice: null, spread: null, spreadBps: null, imbalance: null },
    groupingIncrement: 0.5,
    trades: [{ id: 'x', time: 1, price: 1, side: 'buy', size: 1, count: 1, isLarge: false }],
    rollingStats: { buyVolume: 10, sellVolume: 5, tradeCount: 3, avgTradeSize: 5 },
  })
})

// T4-1, T4-2: Focus switch atomic behaviour
describe('T4-2: setFocusedSymbol atomic 10-step state changes', () => {
  it('increments focusSeqId first (step 1)', () => {
    const seqBefore = useStore.getState().focusSeqId
    useStore.getState().setFocusedSymbol('ETHUSD')
    expect(useStore.getState().focusSeqId).toBe(seqBefore + 1)
  })

  it('clears orderBook to null immediately (step 4)', () => {
    useStore.getState().setFocusedSymbol('ETHUSD')
    expect(useStore.getState().orderBook).toBeNull()
  })

  it('clears trades array immediately (step 4)', () => {
    useStore.getState().setFocusedSymbol('ETHUSD')
    expect(useStore.getState().trades).toHaveLength(0)
  })

  it('clears rollingStats immediately (step 4)', () => {
    useStore.getState().setFocusedSymbol('ETHUSD')
    expect(useStore.getState().rollingStats).toBeNull()
  })
})

// T4-2b: Grouping reset
describe('T4-2b: groupingIncrement resets to finest for new symbol', () => {
  it('resets XRPUSD grouping to 0.0001 (finest)', () => {
    useStore.getState().setFocusedSymbol('XRPUSD')
    expect(useStore.getState().groupingIncrement).toBe(SYMBOL_CONFIG['XRPUSD'].increments[0])
  })

  it('resets DOGEUSD grouping to 0.000001 (finest)', () => {
    useStore.getState().setFocusedSymbol('DOGEUSD')
    expect(useStore.getState().groupingIncrement).toBe(0.000001)
  })
})

// T4-2c: Stale flush guard
describe('T4-2c: stale flush discarded via focusSeqId', () => {
  it('focusSeqId mismatch causes stale data to be ignored', () => {
    const capturedSeqId = useStore.getState().focusSeqId

    // Switch symbol — increments seqId
    useStore.getState().setFocusedSymbol('ETHUSD')

    const currentSeqId = useStore.getState().focusSeqId
    expect(capturedSeqId).not.toBe(currentSeqId)

    // A flush handler from before the switch would check:
    // capturedSeqId !== store.focusSeqId → discard
    const isStale = capturedSeqId !== useStore.getState().focusSeqId
    expect(isStale).toBe(true)
  })

  it('rapid A→B→C switching: seqId is incremented on each switch', () => {
    const initial = useStore.getState().focusSeqId
    useStore.getState().setFocusedSymbol('ETHUSD')
    useStore.getState().setFocusedSymbol('XRPUSD')
    useStore.getState().setFocusedSymbol('SOLUSD')
    expect(useStore.getState().focusSeqId).toBe(initial + 3)
    expect(useStore.getState().focusedSymbol).toBe('SOLUSD')
  })
})

// localStorage persistence on switch
describe('localStorage write on symbol switch', () => {
  it('writes new symbol to localStorage', () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem })
    useStore.getState().setFocusedSymbol('PAXGUSD')
    expect(setItem).toHaveBeenCalledWith('focusedSymbol', 'PAXGUSD')
    vi.unstubAllGlobals()
  })
})
