import { SYMBOLS } from '@config/symbols'
import { useTickerBar } from '@hooks/useTickerBar'
import { TickerCell } from './TickerCell'

export function TickerBar() {
  useTickerBar()
  return (
    <div className="ticker-bar" role="toolbar" aria-label="Symbol ticker bar">
      {SYMBOLS.map((symbol) => (
        <TickerCell key={symbol} symbol={symbol} />
      ))}
    </div>
  )
}
