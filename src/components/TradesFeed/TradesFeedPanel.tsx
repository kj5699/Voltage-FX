import { useState, useCallback, useRef } from 'react'
import { useTrades } from '@store/index'
import { useTradesFlush } from '@hooks/useTradesFlush'
import { VirtualTradeList } from './VirtualTradeList'
import { RollingStatsBar } from './RollingStatsBar'

const DEFAULT_THRESHOLD = 10_000
const DEBOUNCE_MS = 300
const LIST_HEIGHT = 400

export function TradesFeedPanel() {
  const trades = useTrades()
  const [notionalThreshold, setNotionalThreshold] = useState(DEFAULT_THRESHOLD)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useTradesFlush(notionalThreshold)

  const handleThresholdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setNotionalThreshold(value > 0 ? value : DEFAULT_THRESHOLD)
    }, DEBOUNCE_MS)
  }, [])

  return (
    <div className="trades-panel">
      <div className="trades-panel__header">
        <span className="trades-panel__title">Trades</span>
        <div className="trades-panel__threshold">
          <label htmlFor="notional-threshold" className="trades-panel__threshold-label">
            Large ≥ $
          </label>
          <input
            id="notional-threshold"
            type="number"
            className="trades-panel__threshold-input"
            defaultValue={DEFAULT_THRESHOLD}
            min={0}
            onChange={handleThresholdChange}
          />
        </div>
      </div>

      <RollingStatsBar />

      <div className="trades-panel__header trades-panel__col-header">
        <span>Time</span>
        <span>Price</span>
        <span>Size</span>
        <span>Cnt</span>
      </div>

      <VirtualTradeList trades={trades} height={LIST_HEIGHT} />
    </div>
  )
}
