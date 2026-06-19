import { useEffect, useRef } from 'react'
import { wsManager } from '@ws/index'
import { buildSizeMap, detectFlashes } from '@utils/detectFlashes'
import { useStore } from '@store/store'
import { useFocusedSymbol } from '@store/index'
import { getPipelineWorker } from '@workers/workerInstance'
import type { FlashResult } from '@utils/detectFlashes'
import type { WorkerOutput } from '@workers/workerTypes'
import type { Symbol } from '@config/symbols'

const FLUSH_MS = 50

export function useOrderBookFlush(
  onFlash: (bids: FlashResult, asks: FlashResult) => void,
): void {
  const focusedSymbol = useFocusedSymbol()
  const rawRef = useRef<string | null>(null)
  const prevBidSizeMap = useRef<Map<number, number>>(new Map())
  const prevAskSizeMap = useRef<Map<number, number>>(new Map())

  useEffect(() => {
    const capturedSeqId = useStore.getState().focusSeqId
    const symbol: Symbol = focusedSymbol

    // Step 5 — clear buffer before subscribing new symbol
    rawRef.current = null
    prevBidSizeMap.current = new Map()
    prevAskSizeMap.current = new Map()

    // Keep only latest snapshot — intermediate ones are discarded on slow CPUs
    const rawHandler = (raw: string) => { rawRef.current = raw }

    // Step 9 — subscribe new symbol
    wsManager.rawSubscribe('l2_orderbook', symbol, rawHandler)

    const worker = getPipelineWorker()

    const onWorkerMessage = (event: MessageEvent<WorkerOutput>) => {
      const msg = event.data
      if (msg.type !== 'ob') return
      if (msg.seqId !== capturedSeqId) return // stale guard

      const result = msg.orderBook

      const bidFlashes = detectFlashes(prevBidSizeMap.current, buildSizeMap(result.bids))
      const askFlashes = detectFlashes(prevAskSizeMap.current, buildSizeMap(result.asks))

      prevBidSizeMap.current = buildSizeMap(result.bids)
      prevAskSizeMap.current = buildSizeMap(result.asks)

      useStore.getState().setOrderBook(result)

      if (bidFlashes.size > 0 || askFlashes.size > 0) {
        onFlash(bidFlashes, askFlashes)
      }
    }

    worker.addEventListener('message', onWorkerMessage as EventListener)

    const intervalId = setInterval(() => {
      const raw = rawRef.current
      if (!raw) return
      if (useStore.getState().focusSeqId !== capturedSeqId) return // stale guard

      const increment = useStore.getState().groupingIncrement
      worker.postMessage({ type: 'ob', seqId: capturedSeqId, symbol, increment, raw })
    }, FLUSH_MS)

    return () => {
      clearInterval(intervalId)
      worker.removeEventListener('message', onWorkerMessage as EventListener)
      // Step 2 — unsubscribe old symbol
      wsManager.rawUnsubscribe('l2_orderbook', symbol)
    }
  }, [focusedSymbol, onFlash]) // re-runs on symbol change
}
