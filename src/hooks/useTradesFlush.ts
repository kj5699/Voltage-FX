import { useEffect, useRef } from 'react'
import { wsManager } from '@ws/index'
import { useStore } from '@store/store'
import { useFocusedSymbol } from '@store/index'
import { getPipelineWorker } from '@workers/workerInstance'
import type { WorkerOutput } from '@workers/workerTypes'
import type { Symbol } from '@config/symbols'

const FLUSH_MS = 100

export function useTradesFlush(notionalThreshold: number): void {
  const focusedSymbol = useFocusedSymbol()
  const rawsRef = useRef<string[]>([])
  const notionalRef = useRef(notionalThreshold)

  // Keep notionalRef in sync without re-running effect
  notionalRef.current = notionalThreshold

  useEffect(() => {
    const capturedSeqId = useStore.getState().focusSeqId
    const symbol: Symbol = focusedSymbol

    // Step 6 — clear trades buffer before subscribing new symbol
    rawsRef.current = []

    const rawHandler = (raw: string) => { rawsRef.current.push(raw) }

    // Step 10 — subscribe new symbol
    wsManager.rawSubscribe('all_trades', symbol, rawHandler)

    const worker = getPipelineWorker()

    const onWorkerMessage = (event: MessageEvent<WorkerOutput>) => {
      const msg = event.data
      if (msg.type !== 'trades') return
      if (msg.seqId !== capturedSeqId) return // stale guard

      useStore.getState().setTrades(msg.trades, msg.rollingStats)
    }

    worker.addEventListener('message', onWorkerMessage as EventListener)

    const intervalId = setInterval(() => {
      const raws = rawsRef.current
      if (raws.length === 0) return
      if (useStore.getState().focusSeqId !== capturedSeqId) return // stale guard

      rawsRef.current = []
      worker.postMessage({
        type: 'trades',
        seqId: capturedSeqId,
        notionalThreshold: notionalRef.current,
        nowMs: Date.now(),
        raws,
      })
    }, FLUSH_MS)

    return () => {
      clearInterval(intervalId)
      worker.removeEventListener('message', onWorkerMessage as EventListener)
      // Step 3 — unsubscribe old symbol
      wsManager.rawUnsubscribe('all_trades', symbol)
    }
  }, [focusedSymbol]) // re-runs on symbol change
}
