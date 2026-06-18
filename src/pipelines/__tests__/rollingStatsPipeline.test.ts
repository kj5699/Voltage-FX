import { describe, expect, it } from 'vitest'
import { updateRollingDeque, computeRollingStats } from '../rollingStatsPipeline'
import type { ParsedTrade } from '../parsers'

function trade(timestampMs: number, side: 'buy' | 'sell', size = 1): ParsedTrade {
  return { symbol: 'BTCUSD', price: 65000, size, side, timestampMs }
}

describe('updateRollingDeque', () => {
  it('appends new trades to deque', () => {
    const result = updateRollingDeque([], [trade(1000, 'buy')], 1000)
    expect(result).toHaveLength(1)
  })

  it('evicts trades older than 60s', () => {
    const now = 100_000
    const old = trade(now - 61_000, 'buy') // 61s ago — should be evicted
    const fresh = trade(now - 10_000, 'sell') // 10s ago — should stay
    const deque = [old, fresh]
    const result = updateRollingDeque(deque, [], now)
    expect(result).toHaveLength(1)
    expect(result[0]!.side).toBe('sell')
  })

  it('keeps trades exactly at boundary (60s ago)', () => {
    const now = 100_000
    const boundary = trade(now - 60_000, 'buy')
    const result = updateRollingDeque([boundary], [], now)
    expect(result).toHaveLength(1)
  })

  it('does not mutate original deque', () => {
    const deque: ParsedTrade[] = []
    updateRollingDeque(deque, [trade(1000, 'buy')], 1000)
    expect(deque).toHaveLength(0)
  })
})

describe('computeRollingStats', () => {
  it('returns zeros for empty deque', () => {
    const stats = computeRollingStats([])
    expect(stats).toEqual({ buyVolume: 0, sellVolume: 0, tradeCount: 0, avgTradeSize: 0 })
  })

  it('computes buy/sell volumes correctly', () => {
    const deque = [trade(1000, 'buy', 5), trade(2000, 'sell', 3), trade(3000, 'buy', 2)]
    const stats = computeRollingStats(deque)
    expect(stats.buyVolume).toBe(7)
    expect(stats.sellVolume).toBe(3)
    expect(stats.tradeCount).toBe(3)
  })

  it('avgTradeSize = (buyVol + sellVol) / count', () => {
    const deque = [trade(1000, 'buy', 6), trade(2000, 'sell', 4)]
    const stats = computeRollingStats(deque)
    expect(stats.avgTradeSize).toBeCloseTo(5, 5)
  })

  it('avgTradeSize is 0 (not NaN) for empty deque', () => {
    expect(computeRollingStats([]).avgTradeSize).toBe(0)
  })
})
