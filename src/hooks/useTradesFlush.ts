import { useEffect, useRef } from 'react'
import { wsManager } from '@ws/index'
import { parseTradeMessage } from '@pipelines/parsers'
import { aggregateTrades } from '@pipelines/tradePipeline'
import { updateRollingDeque, computeRollingStats } from '@pipelines/rollingStatsPipeline'
import { useStore } from '@store/store'
import { useFocusedSymbol } from '@store/index'
import type { ParsedTrade } from '@pipelines/parsers'
import type { AggregatedTrade } from '@pipelines/tradePipeline'
import type { Symbol } from '@config/symbols'

const FLUSH_MS = 100

export function useTradesFlush(notionalThreshold: number): void {
  const focusedSymbol = useFocusedSymbol()
  const bufferRef = useRef<ParsedTrade[]>([])
  const notionalRef = useRef(notionalThreshold)
  const rollingDequeRef = useRef<ParsedTrade[]>([])

  // Keep notionalRef in sync without re-running effect
  notionalRef.current = notionalThreshold

  useEffect(() => {
    const capturedSeqId = useStore.getState().focusSeqId
    const symbol: Symbol = focusedSymbol

    // Step 6 — clear trades buffer before subscribing new symbol
    bufferRef.current = []
    rollingDequeRef.current = []

    const handler = (msg: unknown) => {
      bufferRef.current.push(parseTradeMessage(msg as Record<string, unknown>))
    }

    // Step 10 — subscribe new symbol
    wsManager.subscribe('all_trades', symbol, handler)

    const intervalId = setInterval(() => {
      const buffer = bufferRef.current
      if (buffer.length === 0) return
      if (useStore.getState().focusSeqId !== capturedSeqId) return // stale guard

      bufferRef.current = []
      const current = useStore.getState().trades as AggregatedTrade[]
      const merged = aggregateTrades(buffer, current, notionalRef.current)

      rollingDequeRef.current = updateRollingDeque(rollingDequeRef.current, buffer, Date.now())
      const stats = computeRollingStats(rollingDequeRef.current)

      useStore.getState().setTrades(merged, stats)
    }, FLUSH_MS)

    return () => {
      clearInterval(intervalId)
      // Step 3 — unsubscribe old symbol
      wsManager.unsubscribe('all_trades', symbol)
    }
  }, [focusedSymbol]) // re-runs on symbol change
}
