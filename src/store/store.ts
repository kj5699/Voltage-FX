import { create } from 'zustand'
import { SYMBOL_CONFIG, isSymbol } from '@config/symbols'
import type { Symbol } from '@config/symbols'
import type { ParsedTicker } from '@pipelines/parsers'
import type { ProcessedOrderBook } from '@pipelines/orderBookPipeline'
import type { AggregatedTrade } from '@pipelines/tradePipeline'
import type { RollingStats } from '@pipelines/rollingStatsPipeline'
import type { WsStatus } from '@ws/WebSocketManager'

const MAX_TRADES = 500
const LS_KEY = 'focusedSymbol'

function initFocusedSymbol(): Symbol {
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (stored && isSymbol(stored)) return stored
  } catch {
    // localStorage unavailable (SSR, test env without setup)
  }
  return 'BTCUSD'
}

export type AppStore = {
  wsStatus: WsStatus
  focusedSymbol: Symbol
  focusSeqId: number
  tickers: Partial<Record<Symbol, ParsedTicker>>
  orderBook: ProcessedOrderBook | null
  groupingIncrement: number
  trades: AggregatedTrade[]
  rollingStats: RollingStats | null

  setWsStatus: (s: WsStatus) => void
  setFocusedSymbol: (s: Symbol) => void
  updateTickers: (batch: Partial<Record<Symbol, ParsedTicker>>) => void
  setOrderBook: (ob: ProcessedOrderBook | null) => void
  setGroupingIncrement: (n: number) => void
  setTrades: (trades: AggregatedTrade[], stats: RollingStats | null) => void
}

const initialSymbol = initFocusedSymbol()

export const useStore = create<AppStore>((set) => ({
  wsStatus: 'disconnected',
  focusedSymbol: initialSymbol,
  focusSeqId: 0,
  tickers: {},
  orderBook: null,
  groupingIncrement: SYMBOL_CONFIG[initialSymbol].increments[0] ?? 1,
  trades: [],
  rollingStats: null,

  setWsStatus: (s) => set({ wsStatus: s }),

  setFocusedSymbol: (s) => set((state) => {
    try { localStorage.setItem(LS_KEY, s) } catch { /* ignore */ }
    return {
      focusSeqId: state.focusSeqId + 1,       // FIRST — invalidates in-flight flushes
      focusedSymbol: s,
      groupingIncrement: SYMBOL_CONFIG[s].increments[0] ?? 1,
      orderBook: null,                         // step 4 — clear stale display immediately
      trades: [],
      rollingStats: null,
    }
  }),

  updateTickers: (batch) => set((state) => ({
    tickers: { ...state.tickers, ...batch },
  })),

  setOrderBook: (ob) => set({ orderBook: ob }),

  setGroupingIncrement: (n) => set({ groupingIncrement: n }),

  setTrades: (trades, stats) => set({
    trades: trades.length > MAX_TRADES ? trades.slice(0, MAX_TRADES) : trades,
    rollingStats: stats,
  }),
}))
