import { memo } from 'react'
import type { ProcessedOrderBook } from '@pipelines/orderBookPipeline'

interface SpreadBarProps {
  data: Pick<ProcessedOrderBook, 'midPrice' | 'spread' | 'spreadBps' | 'imbalance'>
}

export const SpreadBar = memo(function SpreadBar({ data }: SpreadBarProps) {
  const { midPrice, spread, spreadBps, imbalance } = data

  const imbalanceLabel =
    imbalance === null ? '—'
    : imbalance > 0.1 ? 'Bid heavy'
    : imbalance < -0.1 ? 'Ask heavy'
    : 'Balanced'

  return (
    <div className="spread-bar">
      <span className="spread-bar__item">
        <span className="spread-bar__label">Mid</span>
        <span className="spread-bar__value">{midPrice !== null ? midPrice.toFixed(2) : '—'}</span>
      </span>
      <span className="spread-bar__item">
        <span className="spread-bar__label">Spread</span>
        <span className="spread-bar__value">{spread !== null ? spread.toFixed(4) : '—'}</span>
      </span>
      <span className="spread-bar__item">
        <span className="spread-bar__label">Bps</span>
        <span className="spread-bar__value">{spreadBps !== null ? spreadBps.toFixed(1) : '—'}</span>
      </span>
      <span className="spread-bar__item">
        <span className="spread-bar__label">Imbalance</span>
        <span className={`spread-bar__value ${
          imbalanceLabel === 'Bid heavy' ? 'spread-bar__value--buy'
          : imbalanceLabel === 'Ask heavy' ? 'spread-bar__value--sell'
          : ''
        }`}>{imbalanceLabel}</span>
      </span>
    </div>
  )
})
