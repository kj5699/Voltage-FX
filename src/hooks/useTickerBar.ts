import { useEffect, useRef } from 'react'
import { SYMBOLS } from '@config/symbols'
import { wsManager } from '@ws/index'
import { useStore } from '@store/store'
import { getPipelineWorker } from '@workers/workerInstance'
import type { WorkerOutput } from '@workers/workerTypes'

const FLUSH_MS = 200

export function useTickerBar(): void {
  const rawsRef = useRef<string[]>([])

  useEffect(() => {
    const rawHandler = (raw: string) => { rawsRef.current.push(raw) }

    for (const symbol of SYMBOLS) {
      wsManager.rawSubscribe('v2/ticker', symbol, rawHandler)
    }

    const worker = getPipelineWorker()

    const onWorkerMessage = (event: MessageEvent<WorkerOutput>) => {
      const msg = event.data
      if (msg.type !== 'tickers') return
      useStore.getState().updateTickers(msg.tickers)
    }

    worker.addEventListener('message', onWorkerMessage as EventListener)

    const intervalId = setInterval(() => {
      const raws = rawsRef.current
      if (raws.length === 0) return
      rawsRef.current = []
      worker.postMessage({ type: 'tickers', raws })
    }, FLUSH_MS)

    return () => {
      clearInterval(intervalId)
      worker.removeEventListener('message', onWorkerMessage as EventListener)
      for (const symbol of SYMBOLS) {
        wsManager.rawUnsubscribe('v2/ticker', symbol)
      }
    }
  }, [])
}
