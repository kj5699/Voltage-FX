import { useStore } from './store'
import type { Symbol } from '@config/symbols'
import type { ParsedTicker } from '@pipelines/parsers'
import type { ProcessedOrderBook } from '@pipelines/orderBookPipeline'
import type { AggregatedTrade } from '@pipelines/tradePipeline'
import type { RollingStats } from '@pipelines/rollingStatsPipeline'
import type { WsStatus } from '@ws/WebSocketManager'

export function useWsStatus(): WsStatus {
  return useStore((s) => s.wsStatus)
}

export function useFocusedSymbol(): Symbol {
  return useStore((s) => s.focusedSymbol)
}

export function useTicker(symbol: Symbol): ParsedTicker | undefined {
  return useStore((s) => s.tickers[symbol])
}

export function useOrderBook(): ProcessedOrderBook | null {
  return useStore((s) => s.orderBook)
}

export function useGroupingIncrement(): number {
  return useStore((s) => s.groupingIncrement)
}

export function useTrades(): AggregatedTrade[] {
  return useStore((s) => s.trades)
}

export function useRollingStats(): RollingStats | null {
  return useStore((s) => s.rollingStats)
}

export function useFocusSeqId(): number {
  return useStore((s) => s.focusSeqId)
}

export function useSetFocusedSymbol(): (s: Symbol) => void {
  return useStore((s) => s.setFocusedSymbol)
}
