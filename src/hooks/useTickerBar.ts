import { useEffect, useRef } from 'react'
import { SYMBOLS } from '@config/symbols'
import { wsManager } from '@ws/index'
import { parseTickerMessage } from '@pipelines/parsers'
import { mergeLatestTickers } from '@pipelines/tickerPipeline'
import { useStore } from '@store/store'
import type { ParsedTicker } from '@pipelines/parsers'

const FLUSH_MS = 200

export function useTickerBar(): void {
  const bufferRef = useRef<ParsedTicker[]>([])

  useEffect(() => {
    const handler = (msg: unknown) => {
      bufferRef.current.push(parseTickerMessage(msg as Record<string, unknown>))
    }

    for (const symbol of SYMBOLS) {
      wsManager.subscribe('v2/ticker', symbol, handler)
    }

    const intervalId = setInterval(() => {
      const buffer = bufferRef.current
      if (buffer.length === 0) return
      bufferRef.current = []
      const batch = mergeLatestTickers(buffer)
      useStore.getState().updateTickers(batch)
    }, FLUSH_MS)

    return () => {
      clearInterval(intervalId)
      for (const symbol of SYMBOLS) {
        wsManager.unsubscribe('v2/ticker', symbol)
      }
    }
  }, [])
}
