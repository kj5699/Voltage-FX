import { describe, expect, it } from 'vitest'
import { parseOrderBookMessage, parseTradeMessage, parseTickerMessage } from '../parsers'

// T2-0a: Orderbook tuple destructuring
describe('T2-0a: parseOrderBookMessage — tuple destructuring', () => {
  const raw = {
    type: 'l2_orderbook',
    symbol: 'BTCUSD',
    bids: [['62560.9', '3.7315'], ['62558.0', '1.0000']],
    asks: [['62561.5', '2.1000'], ['62562.0', '0.5000']],
    timestamp: 1781798273811000,
  }

  it('converts bids tuples to { price, size } objects', () => {
    const result = parseOrderBookMessage(raw)
    expect(result.bids[0]).toEqual({ price: 62560.9, size: 3.7315 })
    expect(result.bids[1]).toEqual({ price: 62558.0, size: 1.0000 })
  })

  it('converts asks tuples to { price, size } objects', () => {
    const result = parseOrderBookMessage(raw)
    expect(result.asks[0]).toEqual({ price: 62561.5, size: 2.1000 })
  })

  it('passes symbol through', () => {
    const result = parseOrderBookMessage(raw)
    expect(result.symbol).toBe('BTCUSD')
  })
})

// T2-0b: Trade side derivation
describe('T2-0b: parseTradeMessage — side derivation', () => {
  it('returns buy when buyer_role === taker', () => {
    const raw = {
      symbol: 'BTCUSD', price: '65000.0', size: 100,
      buyer_role: 'taker', seller_role: 'maker', timestamp: 1781798273811000,
    }
    expect(parseTradeMessage(raw).side).toBe('buy')
  })

  it('returns sell when seller_role === taker', () => {
    const raw = {
      symbol: 'BTCUSD', price: '65000.0', size: 100,
      buyer_role: 'maker', seller_role: 'taker', timestamp: 1781798273811000,
    }
    expect(parseTradeMessage(raw).side).toBe('sell')
  })

  it('parses price as a number (backend sends string)', () => {
    const raw = {
      symbol: 'BTCUSD', price: '65000.5', size: 50,
      buyer_role: 'taker', seller_role: 'maker', timestamp: 1781798273811000,
    }
    expect(parseTradeMessage(raw).price).toBe(65000.5)
  })
})

// T2-0c: Ticker change multiplier
describe('T2-0c: parseTickerMessage — ltp_change_24h multiplier', () => {
  it('converts multiplier to percentage (1.0234 → 2.34)', () => {
    const raw = { symbol: 'BTCUSD', close: 65000, ltp_change_24h: '1.0234' }
    const result = parseTickerMessage(raw)
    expect(result.change24h).toBeCloseTo(2.34, 5)
  })

  it('handles negative change (0.9800 → -2.00)', () => {
    const raw = { symbol: 'BTCUSD', close: 65000, ltp_change_24h: '0.9800' }
    expect(parseTickerMessage(raw).change24h).toBeCloseTo(-2.0, 5)
  })

  it('uses close field for lastPrice, not price or ltp', () => {
    const raw = { symbol: 'BTCUSD', close: 64694.2, ltp_change_24h: '1.0067', price: 99999 }
    expect(parseTickerMessage(raw).lastPrice).toBe(64694.2)
  })
})

// T2-0d: Microsecond timestamp normalisation
describe('T2-0d: microsecond → millisecond conversion', () => {
  const nowMs = Date.now()
  const nowUs = nowMs * 1000

  it('orderbook timestampMs is close to Date.now()', () => {
    const raw = {
      symbol: 'BTCUSD', bids: [], asks: [], timestamp: nowUs,
    }
    const result = parseOrderBookMessage(raw)
    expect(Math.abs(result.timestampMs - nowMs)).toBeLessThan(100)
  })

  it('trade timestampMs is close to Date.now()', () => {
    const raw = {
      symbol: 'BTCUSD', price: '65000', size: 1,
      buyer_role: 'taker', seller_role: 'maker', timestamp: nowUs,
    }
    const result = parseTradeMessage(raw)
    expect(Math.abs(result.timestampMs - nowMs)).toBeLessThan(100)
  })

  it('raw microsecond value is ~1000x larger than ms value', () => {
    const us = 1781798273811000
    const ms = us / 1000
    expect(ms).toBeCloseTo(1781798273811, -2)
  })
})

// T2-0e: Timestamp milliseconds enable correct bucket merging
describe('T2-0e: ms timestamps enable 100ms bucket math', () => {
  it('two trades 50ms apart have the same bucket (floor / 100)', () => {
    const base = 1781798273811000 // microseconds
    const t1 = base
    const t2 = base + 50_000 // +50ms in microseconds

    const bucket1 = Math.floor((t1 / 1000) / 100)
    const bucket2 = Math.floor((t2 / 1000) / 100)
    expect(bucket1).toBe(bucket2)
  })

  it('using raw microseconds would make them different buckets', () => {
    const base = 1781798273811000
    const t1 = base
    const t2 = base + 50_000

    // Wrong: using μs directly — they'd be 50000 buckets apart
    const wrongBucket1 = Math.floor(t1 / 100)
    const wrongBucket2 = Math.floor(t2 / 100)
    expect(wrongBucket1).not.toBe(wrongBucket2)
  })
})
