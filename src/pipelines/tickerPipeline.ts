import type { Symbol } from '@config/symbols'
import type { ParsedTicker } from './parsers'

export function mergeLatestTickers(
  buffer: ParsedTicker[],
): Partial<Record<Symbol, ParsedTicker>> {
  const result: Partial<Record<Symbol, ParsedTicker>> = {}
  for (const ticker of buffer) {
    result[ticker.symbol] = ticker
  }
  return result
}
