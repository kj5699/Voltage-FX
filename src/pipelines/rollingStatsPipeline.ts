import type { ParsedTrade } from './parsers'

export type RollingStats = {
  buyVolume: number
  sellVolume: number
  tradeCount: number
  avgTradeSize: number
}

const WINDOW_MS = 60_000

export function updateRollingDeque(
  deque: ParsedTrade[],
  newTrades: ParsedTrade[],
  nowMs: number,
): ParsedTrade[] {
  const cutoff = nowMs - WINDOW_MS
  // Drop stale entries from front, append new ones
  const trimmed = deque.filter(t => t.timestampMs >= cutoff)
  return [...trimmed, ...newTrades]
}

export function computeRollingStats(deque: ParsedTrade[]): RollingStats {
  let buyVolume = 0
  let sellVolume = 0

  for (const trade of deque) {
    if (trade.side === 'buy') {
      buyVolume += trade.size
    } else {
      sellVolume += trade.size
    }
  }

  const tradeCount = deque.length
  const avgTradeSize = tradeCount > 0 ? (buyVolume + sellVolume) / tradeCount : 0

  return { buyVolume, sellVolume, tradeCount, avgTradeSize }
}
