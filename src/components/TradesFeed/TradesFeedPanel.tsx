import { useState, useCallback, useEffect, useRef } from 'react'
import { useTrades, useFocusedSymbol } from '@store/index'
import { useStore } from '@store/store'
import { useTradesFlush } from '@hooks/useTradesFlush'
import { SYMBOL_CONFIG } from '@config/symbols'
import { VirtualTradeList } from './VirtualTradeList'
import { RollingStatsBar } from './RollingStatsBar'

const DEBOUNCE_MS = 300
const LIST_HEIGHT = 400

export function TradesFeedPanel() {
  const trades = useTrades()
  const focusedSymbol = useFocusedSymbol()
  const [notionalThreshold, setNotionalThreshold] = useState(
    () => SYMBOL_CONFIG[useStore.getState().focusedSymbol].largeTradeThreshold
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useTradesFlush(notionalThreshold)

  // Reset threshold to symbol default when focused symbol changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setNotionalThreshold(SYMBOL_CONFIG[focusedSymbol].largeTradeThreshold)
  }, [focusedSymbol])

  const defaultThreshold = SYMBOL_CONFIG[focusedSymbol].largeTradeThreshold

  const handleThresholdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setNotionalThreshold(value > 0 ? value : defaultThreshold)
    }, DEBOUNCE_MS)
  }, [defaultThreshold])

  return (
    <div className="trades-panel">
      <div className="trades-panel__header">
        <span className="trades-panel__title">Trades</span>
        <div className="trades-panel__threshold">
          <label htmlFor="notional-threshold" className="trades-panel__threshold-label">
            Large ≥ $
          </label>
          <input
            key={focusedSymbol}
            id="notional-threshold"
            type="number"
            className="trades-panel__threshold-input"
            defaultValue={defaultThreshold}
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
