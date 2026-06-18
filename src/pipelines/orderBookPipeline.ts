import { SYMBOL_CONFIG } from '@config/symbols'
import type { Symbol } from '@config/symbols'
import type { OrderBookLevel } from './parsers'

export type ProcessedLevel = {
  price: number
  size: number
  cumulativeSize: number
  depthWidth: number
}

export type ProcessedOrderBook = {
  bids: ProcessedLevel[]
  asks: ProcessedLevel[]
  midPrice: number | null
  spread: number | null
  spreadBps: number | null
  imbalance: number | null
}

export function aggregateOrderBook(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
  increment: number,
  symbol: Symbol,
): ProcessedOrderBook {
  const { precision } = SYMBOL_CONFIG[symbol]
  const scale = Math.pow(10, precision)
  const incrInt = Math.round(increment * scale)

  const bidMap = new Map<number, number>()
  for (const level of bids) {
    const priceInt = Math.round(level.price * scale)
    const group = Math.floor(priceInt / incrInt) * incrInt
    bidMap.set(group, (bidMap.get(group) ?? 0) + level.size)
  }

  const askMap = new Map<number, number>()
  for (const level of asks) {
    const priceInt = Math.round(level.price * scale)
    const group = Math.ceil(priceInt / incrInt) * incrInt
    askMap.set(group, (askMap.get(group) ?? 0) + level.size)
  }

  // Sort bids descending, asks ascending
  const sortedBidKeys = Array.from(bidMap.keys()).sort((a, b) => b - a)
  const sortedAskKeys = Array.from(askMap.keys()).sort((a, b) => a - b)

  const processedBids = addCumulative(sortedBidKeys, bidMap, scale)
  const processedAsks = addCumulative(sortedAskKeys, askMap, scale)

  const topBid = sortedBidKeys[0]
  const topAsk = sortedAskKeys[0]

  let midPrice: number | null = null
  let spread: number | null = null
  let spreadBps: number | null = null
  let imbalance: number | null = null

  if (topBid !== undefined && topAsk !== undefined) {
    const bidPrice = topBid / scale
    const askPrice = topAsk / scale
    midPrice = (bidPrice + askPrice) / 2
    spread = askPrice - bidPrice
    spreadBps = midPrice > 0 ? (spread / midPrice) * 10000 : null

    const bidVol = processedBids.reduce((s, l) => s + l.size, 0)
    const askVol = processedAsks.reduce((s, l) => s + l.size, 0)
    const total = bidVol + askVol
    imbalance = total > 0 ? (bidVol - askVol) / total : null
  }

  return { bids: processedBids, asks: processedAsks, midPrice, spread, spreadBps, imbalance }
}

function addCumulative(
  sortedKeys: number[],
  sizeMap: Map<number, number>,
  scale: number,
): ProcessedLevel[] {
  let cumulative = 0
  const levels: Array<Omit<ProcessedLevel, 'depthWidth'> & { depthWidth: number }> = []

  for (const key of sortedKeys) {
    const size = sizeMap.get(key) ?? 0
    cumulative += size
    levels.push({ price: key / scale, size, cumulativeSize: cumulative, depthWidth: 0 })
  }

  const maxCumulative = levels.at(-1)?.cumulativeSize ?? 0
  if (maxCumulative > 0) {
    for (const level of levels) {
      level.depthWidth = (level.cumulativeSize / maxCumulative) * 100
    }
  }

  return levels
}
