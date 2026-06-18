import { useEffect, useRef } from 'react'
import { wsManager } from '@ws/index'
import { parseOrderBookMessage } from '@pipelines/parsers'
import { aggregateOrderBook } from '@pipelines/orderBookPipeline'
import { buildSizeMap, detectFlashes } from '@utils/detectFlashes'
import { useStore } from '@store/store'
import type { ParsedOrderBook } from '@pipelines/parsers'
import type { FlashResult } from '@utils/detectFlashes'

const FLUSH_MS = 50

export function useOrderBookFlush(
  onFlash: (bids: FlashResult, asks: FlashResult) => void,
): void {
  const bufferRef = useRef<ParsedOrderBook | null>(null)
  const prevBidSizeMap = useRef<Map<number, number>>(new Map())
  const prevAskSizeMap = useRef<Map<number, number>>(new Map())

  useEffect(() => {
    const store = useStore.getState()
    const capturedSeqId = store.focusSeqId
    const symbol = store.focusedSymbol

    const handler = (msg: unknown) => {
      bufferRef.current = parseOrderBookMessage(msg as Record<string, unknown>)
    }

    wsManager.subscribe('l2_orderbook', symbol, handler)
    useStore.getState().setOrderBook(null)

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
      wsManager.unsubscribe('l2_orderbook', symbol)
      prevBidSizeMap.current = new Map()
      prevAskSizeMap.current = new Map()
      bufferRef.current = null
    }
  }, [onFlash])
}
