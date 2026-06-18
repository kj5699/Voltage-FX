import type { ParsedTrade } from './parsers'

export type AggregatedTrade = {
  id: string
  time: number
  price: number
  side: 'buy' | 'sell'
  size: number
  count: number
  isLarge: boolean
}

const MAX_TRADES = 500
const BUCKET_MS = 100

export function aggregateTrades(
  rawTrades: ParsedTrade[],
  existingTrades: AggregatedTrade[],
  notionalThreshold: number,
  bucketMs = BUCKET_MS,
): AggregatedTrade[] {
  if (rawTrades.length === 0) return existingTrades

  // Group incoming trades by "price:bucket"
  const bucketMap = new Map<string, AggregatedTrade>()

  for (const trade of rawTrades) {
    const bucket = Math.floor(trade.timestampMs / bucketMs)
    const id = `${trade.price}:${bucket}`

    const existing = bucketMap.get(id)
    if (existing) {
      existing.size += trade.size
      existing.count += 1
      existing.isLarge = existing.price * existing.size > notionalThreshold
    } else {
      bucketMap.set(id, {
        id,
        time: trade.timestampMs,
        price: trade.price,
        side: trade.side,
        size: trade.size,
        count: 1,
        isLarge: trade.price * trade.size > notionalThreshold,
      })
    }
  }

  // Merge with existing (newest first): new bucket entries may overlap with existing
  const newEntries = Array.from(bucketMap.values())

  // Build merged list: new entries go first, then existing (excluding ids that got updated)
  const updatedIds = new Set(bucketMap.keys())
  const merged = [
    ...newEntries,
    ...existingTrades.filter(t => !updatedIds.has(t.id)),
  ]

  // Cap at MAX_TRADES (keep newest = first in array)
  return merged.length > MAX_TRADES ? merged.slice(0, MAX_TRADES) : merged
}
