import { memo } from 'react'
import { useTicker, useSetFocusedSymbol, useIsSymbolFocused } from '@store/index'
import { SYMBOL_CONFIG } from '@config/symbols'
import type { Symbol } from '@config/symbols'

interface TickerCellProps {
  symbol: Symbol
}

export const TickerCell = memo(function TickerCell({ symbol }: TickerCellProps) {
  const ticker = useTicker(symbol)
  const isFocused = useIsSymbolFocused(symbol)
  const setFocusedSymbol = useSetFocusedSymbol()
  const precision = SYMBOL_CONFIG[symbol].precision

  const priceStr = ticker ? ticker.lastPrice.toFixed(precision) : '—'
  const change = ticker?.change24h ?? 0
  const changeStr = ticker ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—'
  const changeClass = ticker
    ? change >= 0
      ? 'ticker-cell__change--positive'
      : 'ticker-cell__change--negative'
    : ''

  return (
    <button
      className={`ticker-cell${isFocused ? ' ticker-cell--focused' : ''}`}
      onClick={() => setFocusedSymbol(symbol)}
      aria-pressed={isFocused}
    >
      <span className="ticker-cell__symbol">{symbol}</span>
      <span className="ticker-cell__price">{priceStr}</span>
      <span className={`ticker-cell__change ${changeClass}`}>{changeStr}</span>
    </button>
  )
})
