import { describe, expect, it } from 'vitest'
import { mergeLatestTickers } from '../tickerPipeline'
import type { ParsedTicker } from '../parsers'

function ticker(symbol: ParsedTicker['symbol'], lastPrice: number): ParsedTicker {
  return { symbol, lastPrice, change24h: 0.5 }
}

// T2-20: Latest-value merge
describe('T2-20: mergeLatestTickers', () => {
  it('keeps only the latest value per symbol', () => {
    const buffer = [
      ticker('BTCUSD', 60000),
      ticker('BTCUSD', 61000),
      ticker('BTCUSD', 62000),
    ]
    const result = mergeLatestTickers(buffer)
    expect(result['BTCUSD']?.lastPrice).toBe(62000)
  })

  it('handles multiple symbols independently', () => {
    const buffer = [
      ticker('BTCUSD', 62000),
      ticker('ETHUSD', 3000),
      ticker('BTCUSD', 63000),
    ]
    const result = mergeLatestTickers(buffer)
    expect(result['BTCUSD']?.lastPrice).toBe(63000)
    expect(result['ETHUSD']?.lastPrice).toBe(3000)
  })

  it('returns empty object for empty buffer', () => {
    expect(mergeLatestTickers([])).toEqual({})
  })

  it('does not produce phantom entries for symbols not in buffer', () => {
    const buffer = [ticker('BTCUSD', 62000)]
    const result = mergeLatestTickers(buffer)
    expect(Object.keys(result)).toHaveLength(1)
    expect(result['ETHUSD']).toBeUndefined()
  })

  it('does not mutate input buffer', () => {
    const buffer = [ticker('BTCUSD', 62000)]
    mergeLatestTickers(buffer)
    expect(buffer).toHaveLength(1)
  })
})
