import { useEffect, useRef } from 'react'
import { wsManager } from '@ws/index'
import { parseTradeMessage } from '@pipelines/parsers'
import { aggregateTrades } from '@pipelines/tradePipeline'
import { updateRollingDeque, computeRollingStats } from '@pipelines/rollingStatsPipeline'
import { useStore } from '@store/store'
import type { ParsedTrade } from '@pipelines/parsers'
import type { AggregatedTrade } from '@pipelines/tradePipeline'

const FLUSH_MS = 100

export function useTradesFlush(notionalThreshold: number): void {
  const bufferRef = useRef<ParsedTrade[]>([])
  const notionalRef = useRef(notionalThreshold)
  const rollingDequeRef = useRef<ParsedTrade[]>([])

  // Keep notionalRef in sync without re-running effect
  notionalRef.current = notionalThreshold

  useEffect(() => {
    const store = useStore.getState()
    const capturedSeqId = store.focusSeqId
    const symbol = store.focusedSymbol

    const handler = (msg: unknown) => {
      bufferRef.current.push(parseTradeMessage(msg as Record<string, unknown>))
    }

    wsManager.subscribe('all_trades', symbol, handler)

    const intervalId = setInterval(() => {
      const buffer = bufferRef.current
      if (buffer.length === 0) return
      if (useStore.getState().focusSeqId !== capturedSeqId) return

      bufferRef.current = []
      const current = useStore.getState().trades as AggregatedTrade[]
      const merged = aggregateTrades(buffer, current, notionalRef.current)

      rollingDequeRef.current = updateRollingDeque(rollingDequeRef.current, buffer, Date.now())
      const stats = computeRollingStats(rollingDequeRef.current)

      useStore.getState().setTrades(merged, stats)
    }, FLUSH_MS)

    return () => {
      clearInterval(intervalId)
      wsManager.unsubscribe('all_trades', symbol)
      bufferRef.current = []
      rollingDequeRef.current = []
    }
  }, []) // intentionally stable — symbol tracked via capturedSeqId
}
