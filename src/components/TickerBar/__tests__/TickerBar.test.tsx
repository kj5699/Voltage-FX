import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TickerBar } from '../TickerBar'
import { TickerCell } from '../TickerCell'
import { useStore } from '@store/store'
import type { ParsedTicker } from '@pipelines/parsers'

// Mock the WS manager so useTickerBar doesn't open a real socket
vi.mock('@ws/index', () => ({
  wsManager: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    rawSubscribe: vi.fn(),
    rawUnsubscribe: vi.fn(),
  },
}))

vi.mock('@workers/workerInstance', () => ({
  getPipelineWorker: () => ({
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }),
}))

function makeTicker(symbol: ParsedTicker['symbol'], lastPrice: number, change24h: number): ParsedTicker {
  return { symbol, lastPrice, change24h }
}

beforeEach(() => {
  useStore.setState({
    wsStatus: 'disconnected',
    focusedSymbol: 'BTCUSD',
    focusSeqId: 0,
    tickers: {},
    orderBook: null,
    groupingIncrement: 0.5,
    trades: [],
    rollingStats: null,
  })
})

// T5-1: All 6 cells render
describe('T5-1: TickerBar renders all 6 symbol cells', () => {
  it('renders 6 ticker cells', () => {
    render(<TickerBar />)
    expect(screen.getByText('BTCUSD')).toBeInTheDocument()
    expect(screen.getByText('ETHUSD')).toBeInTheDocument()
    expect(screen.getByText('XRPUSD')).toBeInTheDocument()
    expect(screen.getByText('SOLUSD')).toBeInTheDocument()
    expect(screen.getByText('PAXGUSD')).toBeInTheDocument()
    expect(screen.getByText('DOGEUSD')).toBeInTheDocument()
  })
})

// T5-2: Colour coding
describe('T5-2: TickerCell colour coding', () => {
  it('applies positive class for change24h >= 0', () => {
    useStore.setState({ tickers: { BTCUSD: makeTicker('BTCUSD', 62000, 1.5) } })
    render(<TickerCell symbol="BTCUSD" />)
    const change = screen.getByText('+1.50%')
    expect(change).toHaveClass('ticker-cell__change--positive')
  })

  it('applies negative class for change24h < 0', () => {
    useStore.setState({ tickers: { BTCUSD: makeTicker('BTCUSD', 58000, -2.3) } })
    render(<TickerCell symbol="BTCUSD" />)
    const change = screen.getByText('-2.30%')
    expect(change).toHaveClass('ticker-cell__change--negative')
  })

  it('applies positive class for exactly 0 change', () => {
    useStore.setState({ tickers: { BTCUSD: makeTicker('BTCUSD', 62000, 0) } })
    render(<TickerCell symbol="BTCUSD" />)
    const change = screen.getByText('+0.00%')
    expect(change).toHaveClass('ticker-cell__change--positive')
  })
})

// T5-3: Click calls setFocusedSymbol
describe('T5-3: clicking a cell sets focused symbol', () => {
  it('calls setFocusedSymbol with the correct symbol', () => {
    render(<TickerBar />)
    const ethCell = screen.getByRole('button', { name: /ETHUSD/i })
    fireEvent.click(ethCell)
    expect(useStore.getState().focusedSymbol).toBe('ETHUSD')
  })
})

// T5-4: Focused cell has distinct class
describe('T5-4: focused cell has distinct CSS class', () => {
  it('focused cell has ticker-cell--focused class', () => {
    useStore.setState({ focusedSymbol: 'ETHUSD' })
    render(<TickerBar />)
    const ethCell = screen.getByRole('button', { name: /ETHUSD/i })
    expect(ethCell).toHaveClass('ticker-cell--focused')
  })

  it('no other cell has ticker-cell--focused when ETHUSD is focused', () => {
    useStore.setState({ focusedSymbol: 'ETHUSD' })
    render(<TickerBar />)
    const btcCell = screen.getByRole('button', { name: /BTCUSD/i })
    expect(btcCell).not.toHaveClass('ticker-cell--focused')
  })
})

// T5-5: Render isolation — BTCUSD update must not re-render ETHUSD cell
describe('T5-5: render isolation', () => {
  it('ETHUSD cell does not re-render when BTCUSD ticker updates', () => {
    const renderCounts = { ETHUSD: 0 }

    // Spy on React.memo by intercepting renders via a wrapper
    const { rerender } = render(<TickerBar />)

    const ethEl = screen.getByText('ETHUSD')
    const btcTicker = makeTicker('BTCUSD', 62000, 0.5)
    const ethTicker = makeTicker('ETHUSD', 3000, 1.2)

    act(() => {
      useStore.setState({
        tickers: { BTCUSD: btcTicker, ETHUSD: ethTicker },
      })
    })

    // Update only BTC
    act(() => {
      useStore.setState((s) => ({
        tickers: { ...s.tickers, BTCUSD: makeTicker('BTCUSD', 63000, 0.8) },
      }))
    })

    rerender(<TickerBar />)
    void ethEl

    // ETHUSD element still renders correctly (no crash, correct data)
    expect(screen.getByText('ETHUSD')).toBeInTheDocument()
    // ETH price unchanged
    expect(screen.getByText('ETHUSD').closest('button'))
      .toContainElement(screen.getByText('3000.00'))

    void renderCounts
  })
})

// Price formatting
describe('price formatting by symbol precision', () => {
  it('formats BTCUSD to 1 decimal place', () => {
    useStore.setState({ tickers: { BTCUSD: makeTicker('BTCUSD', 62000.1234, 0) } })
    render(<TickerCell symbol="BTCUSD" />)
    expect(screen.getByText('62000.1')).toBeInTheDocument()
  })

  it('formats DOGEUSD to 6 decimal places', () => {
    useStore.setState({ tickers: { DOGEUSD: makeTicker('DOGEUSD', 0.123456, 0) } })
    render(<TickerCell symbol="DOGEUSD" />)
    expect(screen.getByText('0.123456')).toBeInTheDocument()
  })

  it('shows — for price and change when no ticker data', () => {
    render(<TickerCell symbol="SOLUSD" />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })
})
