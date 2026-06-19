import { parseOrderBookMessage, parseTradeMessage, parseTickerMessage } from '@pipelines/parsers'
import { aggregateOrderBook } from '@pipelines/orderBookPipeline'
import { aggregateTrades } from '@pipelines/tradePipeline'
import { updateRollingDeque, computeRollingStats } from '@pipelines/rollingStatsPipeline'
import { mergeLatestTickers } from '@pipelines/tickerPipeline'
import type { WorkerInput, WorkerOutput } from './workerTypes'
import type { AggregatedTrade } from '@pipelines/tradePipeline'
import type { ParsedTrade } from '@pipelines/parsers'

// TypeScript's lib is "dom" which types self as Window.
// At runtime this file runs in DedicatedWorkerGlobalScope — both have onmessage and postMessage.
type WorkerCtx = {
  onmessage: ((event: MessageEvent<WorkerInput>) => void) | null
  postMessage: (data: WorkerOutput) => void
}
const ctx = self as unknown as WorkerCtx

let existingTrades: AggregatedTrade[] = []
let rollingDeque: ParsedTrade[] = []
let lastSeqId = -1

ctx.onmessage = (event: MessageEvent<WorkerInput>) => {
  const msg = event.data

  if (msg.type === 'ob') {
    const { seqId, symbol, increment, raw } = msg
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const ob = parseOrderBookMessage(parsed)
    const orderBook = aggregateOrderBook(ob.bids, ob.asks, increment, symbol)
    ctx.postMessage({ type: 'ob', seqId, orderBook })

  } else if (msg.type === 'trades') {
    const { seqId, notionalThreshold, nowMs, raws } = msg
    if (seqId !== lastSeqId) {
      existingTrades = []
      rollingDeque = []
      lastSeqId = seqId
    }
    const parsed = raws.map(r => parseTradeMessage(JSON.parse(r) as Record<string, unknown>))
    existingTrades = aggregateTrades(parsed, existingTrades, notionalThreshold)
    rollingDeque = updateRollingDeque(rollingDeque, parsed, nowMs)
    const rollingStats = computeRollingStats(rollingDeque)
    ctx.postMessage({ type: 'trades', seqId, trades: existingTrades, rollingStats })

  } else if (msg.type === 'tickers') {
    const { raws } = msg
    const parsed = raws.map(r => parseTickerMessage(JSON.parse(r) as Record<string, unknown>))
    const tickers = mergeLatestTickers(parsed)
    ctx.postMessage({ type: 'tickers', tickers })
  }
}
