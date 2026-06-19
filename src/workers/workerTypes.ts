import type { ProcessedOrderBook } from '@pipelines/orderBookPipeline'
import type { AggregatedTrade } from '@pipelines/tradePipeline'
import type { RollingStats } from '@pipelines/rollingStatsPipeline'
import type { ParsedTicker } from '@pipelines/parsers'
import type { Symbol } from '@config/symbols'

export type WorkerInput =
  | { type: 'ob'; seqId: number; symbol: Symbol; increment: number; raw: string }
  | { type: 'trades'; seqId: number; notionalThreshold: number; nowMs: number; raws: string[] }
  | { type: 'tickers'; raws: string[] }

export type WorkerOutput =
  | { type: 'ob'; seqId: number; orderBook: ProcessedOrderBook }
  | { type: 'trades'; seqId: number; trades: AggregatedTrade[]; rollingStats: RollingStats }
  | { type: 'tickers'; tickers: Partial<Record<Symbol, ParsedTicker>> }
