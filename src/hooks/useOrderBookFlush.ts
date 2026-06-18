import { useEffect, useRef } from 'react'
import { wsManager } from '@ws/index'
import { parseOrderBookMessage } from '@pipelines/parsers'
import { aggregateOrderBook } from '@pipelines/orderBookPipeline'
import { buildSizeMap, detectFlashes } from '@utils/detectFlashes'
import { useStore } from '@store/store'
import { useFocusedSymbol } from '@store/index'
import type { ParsedOrderBook } from '@pipelines/parsers'
import type { FlashResult } from '@utils/detectFlashes'
import type { Symbol } from '@config/symbols'

const FLUSH_MS = 50

export function useOrderBookFlush(
  onFlash: (bids: FlashResult, asks: FlashResult) => void,
): void {
  const focusedSymbol = useFocusedSymbol()
  const bufferRef = useRef<ParsedOrderBook | null>(null)
  const prevBidSizeMap = useRef<Map<number, number>>(new Map())
  const prevAskSizeMap = useRef<Map<number, number>>(new Map())

  useEffect(() => {
    const capturedSeqId = useStore.getState().focusSeqId
    const symbol: Symbol = focusedSymbol

    // Steps 5 — clear buffer before subscribing new symbol
    bufferRef.current = null
    prevBidSizeMap.current = new Map()
    prevAskSizeMap.current = new Map()

    const handler = (msg: unknown) => {
      bufferRef.current = parseOrderBookMessage(msg as Record<string, unknown>)
    }

    // Step 9 — subscribe new symbol
    wsManager.subscribe('l2_orderbook', symbol, handler)

    const intervalId = setInterval(() => {
      const parsed = bufferRef.current
      if (!parsed) return
      if (useStore.getState().focusSeqId !== capturedSeqId) return // stale guard

      const increment = useStore.getState().groupingIncrement
      const result = aggregateOrderBook(parsed.bids, parsed.asks, increment, symbol)

      const bidFlashes = detectFlashes(prevBidSizeMap.current, buildSizeMap(result.bids))
      const askFlashes = detectFlashes(prevAskSizeMap.current, buildSizeMap(result.asks))

      prevBidSizeMap.current = buildSizeMap(result.bids)
      prevAskSizeMap.current = buildSizeMap(result.asks)

      useStore.getState().setOrderBook(result)

      if (bidFlashes.size > 0 || askFlashes.size > 0) {
        onFlash(bidFlashes, askFlashes)
      }
    }, FLUSH_MS)

    return () => {
      clearInterval(intervalId)
      // Step 2 — unsubscribe old symbol
      wsManager.unsubscribe('l2_orderbook', symbol)
    }
  }, [focusedSymbol, onFlash]) // re-runs on symbol change
}
