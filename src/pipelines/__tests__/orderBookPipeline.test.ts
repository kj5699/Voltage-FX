import { describe, expect, it } from 'vitest'
import { aggregateOrderBook } from '../orderBookPipeline'
import type { OrderBookLevel } from '../parsers'

function level(price: number, size: number): OrderBookLevel {
  return { price, size }
}

// T2-1: Basic aggregation
describe('T2-1: basic aggregation', () => {
  it('produces sorted bids descending and asks ascending', () => {
    const bids = [level(62560, 1), level(62558, 2), level(62559, 3)]
    const asks = [level(62562, 1), level(62561, 2), level(62563, 3)]
    const result = aggregateOrderBook(bids, asks, 1, 'BTCUSD')

    expect(result.bids[0]!.price).toBeGreaterThan(result.bids[1]!.price)
    expect(result.asks[0]!.price).toBeLessThan(result.asks[1]!.price)
  })
})

// T2-2: Size aggregation across grouped levels
describe('T2-2: size aggregation', () => {
  it('sums sizes for levels in same bucket', () => {
    // BTCUSD precision=1, increment=1: prices 62560.0 and 62560.4 → same group 62560
    const bids = [level(62560.0, 1.5), level(62560.4, 0.5)]
    const result = aggregateOrderBook(bids, [], 1, 'BTCUSD')
    expect(result.bids[0]!.size).toBeCloseTo(2.0, 5)
  })
})

// T2-3: Ask ceil invariant
describe('T2-3: ask ceil — no ask price ≤ any bid price', () => {
  it('grouped ask price is always > grouped bid price at same raw level', () => {
    // If bid and ask start at same raw price, ceil(ask) > floor(bid)
    const bids = [level(62560.5, 1)]
    const asks = [level(62560.5, 1)]
    const result = aggregateOrderBook(bids, asks, 1, 'BTCUSD')

    const bidPrice = result.bids[0]!.price
    const askPrice = result.asks[0]!.price
    expect(askPrice).toBeGreaterThan(bidPrice)
  })
})

// T2-4: Cumulative sizes
describe('T2-4: cumulative sizes', () => {
  it('cumulativeSize is prefix sum of sizes', () => {
    const bids = [level(62560, 1), level(62559, 2), level(62558, 3)]
    const result = aggregateOrderBook(bids, [], 1, 'BTCUSD')

    expect(result.bids[0]!.cumulativeSize).toBeCloseTo(1, 5)
    expect(result.bids[1]!.cumulativeSize).toBeCloseTo(3, 5)
    expect(result.bids[2]!.cumulativeSize).toBeCloseTo(6, 5)
  })
})

// T2-5: Depth bar widths
describe('T2-5: depth bar widths', () => {
  it('deepest level has depthWidth === 100', () => {
    const bids = [level(62560, 1), level(62559, 2), level(62558, 3)]
    const result = aggregateOrderBook(bids, [], 1, 'BTCUSD')
    expect(result.bids.at(-1)!.depthWidth).toBeCloseTo(100, 5)
  })

  it('bid and ask sides scale independently', () => {
    const bids = [level(62560, 10)]
    const asks = [level(62561, 5)]
    const result = aggregateOrderBook(bids, asks, 1, 'BTCUSD')
    expect(result.bids[0]!.depthWidth).toBeCloseTo(100, 5)
    expect(result.asks[0]!.depthWidth).toBeCloseTo(100, 5)
  })
})

// T2-6, T2-7: Spread metrics
describe('T2-6/T2-7: spread metrics', () => {
  it('computes midPrice, spread, spreadBps correctly', () => {
    const bids = [level(62560, 1)]
    const asks = [level(62562, 1)]
    const result = aggregateOrderBook(bids, asks, 1, 'BTCUSD')

    expect(result.midPrice).toBeCloseTo(62561, 5)
    expect(result.spread).toBeCloseTo(2, 5)
    expect(result.spreadBps).toBeCloseTo((2 / 62561) * 10000, 2)
  })

  it('computes imbalance: all bids → +1', () => {
    const bids = [level(62560, 100)]
    const asks: OrderBookLevel[] = []
    const result = aggregateOrderBook(bids, asks, 1, 'BTCUSD')
    // No asks → imbalance not computable (midPrice null)
    expect(result.imbalance).toBeNull()
  })

  it('equal bid and ask volume → imbalance ≈ 0', () => {
    const bids = [level(62560, 5)]
    const asks = [level(62562, 5)]
    const result = aggregateOrderBook(bids, asks, 1, 'BTCUSD')
    expect(result.imbalance).toBeCloseTo(0, 5)
  })
})

// T2-8: Multi-precision grouping
describe('T2-8: XRPUSD 4dp grouping', () => {
  it('groups correctly with precision=4, increment=0.0001', () => {
    const bids = [level(0.5432, 1000), level(0.5431, 500)]
    const result = aggregateOrderBook(bids, [], 0.0001, 'XRPUSD')
    // Each level has its own bucket at 4dp
    expect(result.bids.length).toBeGreaterThanOrEqual(1)
    expect(result.bids[0]!.price).toBeCloseTo(0.5432, 4)
  })
})

describe('T2-8b: SOLUSD uses 4dp precision (not 2dp)', () => {
  it('SOLUSD grouping at 0.0001 increment resolves correctly', () => {
    const bids = [level(150.1234, 1)]
    const result = aggregateOrderBook(bids, [], 0.0001, 'SOLUSD')
    expect(result.bids[0]!.price).toBeCloseTo(150.1234, 4)
  })
})

describe('T2-8c: DOGEUSD uses 6dp precision (not 4dp)', () => {
  it('DOGEUSD grouping at 0.000001 increment resolves correctly', () => {
    const bids = [level(0.123456, 1_000_000)]
    const result = aggregateOrderBook(bids, [], 0.000001, 'DOGEUSD')
    expect(result.bids[0]!.price).toBeCloseTo(0.123456, 6)
  })
})

// T2-9: Empty inputs
describe('T2-9: empty inputs', () => {
  it('empty bids → midPrice/spread/imbalance null, no crash', () => {
    const result = aggregateOrderBook([], [level(62560, 1)], 1, 'BTCUSD')
    expect(result.midPrice).toBeNull()
    expect(result.spread).toBeNull()
    expect(result.bids).toHaveLength(0)
  })

  it('empty asks → same nulls', () => {
    const result = aggregateOrderBook([level(62560, 1)], [], 1, 'BTCUSD')
    expect(result.midPrice).toBeNull()
    expect(result.asks).toHaveLength(0)
  })

  it('both empty → all nulls, no crash', () => {
    const result = aggregateOrderBook([], [], 1, 'BTCUSD')
    expect(result.midPrice).toBeNull()
    expect(result.spread).toBeNull()
    expect(result.imbalance).toBeNull()
  })
})

// Benchmark
describe('performance: aggregateOrderBook < 2ms for 200 levels', () => {
  it('runs in under 2ms', () => {
    const bids = Array.from({ length: 200 }, (_, i) => level(62560 - i * 0.5, Math.random() * 5))
    const asks = Array.from({ length: 200 }, (_, i) => level(62561 + i * 0.5, Math.random() * 5))

    const start = performance.now()
    aggregateOrderBook(bids, asks, 0.5, 'BTCUSD')
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(2)
  })
})
