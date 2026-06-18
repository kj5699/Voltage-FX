import { describe, expect, it } from 'vitest'
import { aggregateTrades } from '../tradePipeline'
import type { ParsedTrade } from '../parsers'

function trade(overrides: Partial<ParsedTrade> = {}): ParsedTrade {
  return {
    symbol: 'BTCUSD',
    price: 65000,
    size: 1,
    side: 'buy',
    timestampMs: 1_700_000_000_000,
    ...overrides,
  }
}

describe('aggregateTrades: basic merging', () => {
  it('returns single row for one trade', () => {
    const result = aggregateTrades([trade()], [], 100_000)
    expect(result).toHaveLength(1)
    expect(result[0]!.count).toBe(1)
  })

  it('merges two trades at same price in same 100ms bucket', () => {
    const base = 1_700_000_000_000
    const t1 = trade({ timestampMs: base, size: 1 })
    const t2 = trade({ timestampMs: base + 50, size: 2 })
    const result = aggregateTrades([t1, t2], [], 100_000)
    expect(result).toHaveLength(1)
    expect(result[0]!.size).toBeCloseTo(3)
    expect(result[0]!.count).toBe(2)
  })

  it('does NOT merge trades in different 100ms buckets', () => {
    const base = 1_700_000_000_000
    const t1 = trade({ timestampMs: base })
    const t2 = trade({ timestampMs: base + 150 }) // different bucket
    const result = aggregateTrades([t1, t2], [], 100_000)
    expect(result).toHaveLength(2)
  })

  it('does NOT merge trades at different prices', () => {
    const base = 1_700_000_000_000
    const t1 = trade({ timestampMs: base, price: 65000 })
    const t2 = trade({ timestampMs: base + 10, price: 65001 })
    const result = aggregateTrades([t1, t2], [], 100_000)
    expect(result).toHaveLength(2)
  })
})

describe('aggregateTrades: isLarge flag', () => {
  it('marks trade as large when price * size > threshold', () => {
    const t = trade({ price: 65000, size: 2 }) // notional = 130000
    const result = aggregateTrades([t], [], 100_000)
    expect(result[0]!.isLarge).toBe(true)
  })

  it('does not mark as large when below threshold', () => {
    const t = trade({ price: 65000, size: 1 }) // notional = 65000
    const result = aggregateTrades([t], [], 100_000)
    expect(result[0]!.isLarge).toBe(false)
  })
})

describe('aggregateTrades: cap at 500', () => {
  it('caps output at 500 entries', () => {
    const existing = Array.from({ length: 499 }, (_, i) =>
      trade({ timestampMs: 1_700_000_000_000 - (i + 1) * 200, price: 65000 + i })
    )
    const [existing0, ...rest] = existing
    const existingAgg = aggregateTrades(existing0 ? [existing0] : [], [], 100_000)
    const fullExisting = [
      ...existingAgg,
      ...rest.map(t => ({
        id: `${t.price}:${Math.floor(t.timestampMs / 100)}`,
        time: t.timestampMs,
        price: t.price,
        side: t.side as 'buy' | 'sell',
        size: t.size,
        count: 1,
        isLarge: false,
      })),
    ]

    const newTrade = trade({ timestampMs: 1_700_000_000_000 + 1000, price: 99999 })
    const result = aggregateTrades([newTrade], fullExisting, 100_000)
    expect(result.length).toBeLessThanOrEqual(500)
  })
})

describe('aggregateTrades: empty inputs', () => {
  it('returns existing trades unchanged when rawTrades is empty', () => {
    const existing = [{ id: 'a', time: 1, price: 65000, side: 'buy' as const, size: 1, count: 1, isLarge: false }]
    expect(aggregateTrades([], existing, 100_000)).toBe(existing)
  })
})
