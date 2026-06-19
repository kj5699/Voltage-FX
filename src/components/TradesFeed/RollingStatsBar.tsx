import { memo, useEffect, useRef, useState } from 'react'
import { useRollingStats } from '@store/index'
import type { RollingStats } from '@pipelines/rollingStatsPipeline'

export const RollingStatsBar = memo(function RollingStatsBar() {
  const liveStats = useRollingStats()
  const liveRef = useRef(liveStats)
  const [displayStats, setDisplayStats] = useState<RollingStats | null>(null)

  // Keep ref in sync on every render without re-triggering the interval
  liveRef.current = liveStats

  // Update display at 1s cadence — not on every 100ms flush
  useEffect(() => {
    const id = setInterval(() => {
      setDisplayStats(liveRef.current)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const fmt = (n: number) => n.toFixed(2)
  const s = displayStats

  return (
    <div className="rolling-stats">
      <span className="rolling-stats__item">
        <span className="rolling-stats__label">Buy Vol</span>
        <span className="rolling-stats__value rolling-stats__value--buy">
          {s ? fmt(s.buyVolume) : '—'}
        </span>
      </span>
      <span className="rolling-stats__item">
        <span className="rolling-stats__label">Sell Vol</span>
        <span className="rolling-stats__value rolling-stats__value--sell">
          {s ? fmt(s.sellVolume) : '—'}
        </span>
      </span>
      <span className="rolling-stats__item">
        <span className="rolling-stats__label">Trades</span>
        <span className="rolling-stats__value">{s ? s.tradeCount : '—'}</span>
      </span>
      <span className="rolling-stats__item">
        <span className="rolling-stats__label">Avg Size</span>
        <span className="rolling-stats__value">{s ? fmt(s.avgTradeSize) : '—'}</span>
      </span>
    </div>
  )
})
