import { useRef, useState, useCallback, useEffect } from 'react'
import { List } from 'react-window'
import { useFocusedSymbol } from '@store/index'
import { SYMBOL_CONFIG } from '@config/symbols'
import type { AggregatedTrade } from '@pipelines/tradePipeline'
import type { CSSProperties } from 'react'

const ROW_HEIGHT = 35
const SCROLL_THRESHOLD_PX = 30

// Custom row props (no ariaAttributes/index/style — those are injected by List)
interface RowExtraProps {
  trades: AggregatedTrade[]
  precision: number
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  const ms3 = d.getMilliseconds().toString().padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms3}`
}

function TradeRow(props: RowExtraProps & {
  ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' }
  index: number
  style: CSSProperties
}) {
  const { index, style, trades, precision } = props
  const trade = trades[index]
  if (!trade) return null

  return (
    <div
      style={style}
      className={`trade-row trade-row--${trade.side}${trade.isLarge ? ' trade-row--large' : ''}`}
    >
      <span className="trade-row__time">{formatTime(trade.time)}</span>
      <span className="trade-row__price">{trade.price.toFixed(precision)}</span>
      <span className="trade-row__size">{trade.size.toFixed(4)}</span>
      {trade.count > 1 && <span className="trade-row__count">({trade.count})</span>}
    </div>
  )
}

interface ListImperativeAPI {
  scrollToRow(config: { align?: 'auto' | 'center' | 'end' | 'smart' | 'start'; index: number }): void
}

interface VirtualTradeListProps {
  trades: AggregatedTrade[]
  height: number
}

export function VirtualTradeList({ trades, height }: VirtualTradeListProps) {
  const focusedSymbol = useFocusedSymbol()
  const precision = SYMBOL_CONFIG[focusedSymbol].precision
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listRef = useRef<ListImperativeAPI | null>(null)
  const [isAutoScrollLocked, setIsAutoScrollLocked] = useState(true)

  // Reset auto-scroll when symbol changes
  useEffect(() => {
    setIsAutoScrollLocked(true)
  }, [focusedSymbol])

  // Auto-scroll to top (newest, index 0) when new trades arrive
  useEffect(() => {
    if (isAutoScrollLocked && trades.length > 0) {
      listRef.current?.scrollToRow({ index: 0, align: 'start' })
    }
  }, [trades, isAutoScrollLocked])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = (e.target as HTMLDivElement).scrollTop
    if (scrollTop > SCROLL_THRESHOLD_PX) {
      setIsAutoScrollLocked(false)
    } else {
      setIsAutoScrollLocked(true)
    }
  }, [])

  const handleJumpToLatest = useCallback(() => {
    listRef.current?.scrollToRow({ index: 0, align: 'start' })
    setIsAutoScrollLocked(true)
  }, [])

  const rowProps: RowExtraProps = { trades, precision }

  return (
    <div
      className="virtual-trade-list-wrapper"
      style={{ position: 'relative' }}
      onScroll={handleScroll}
    >
      <List
        listRef={listRef as never}
        rowCount={trades.length}
        rowHeight={ROW_HEIGHT}
        rowComponent={TradeRow}
        rowProps={rowProps}
        style={{ height }}
      />
      {!isAutoScrollLocked && (
        <button
          className="jump-to-latest"
          onClick={handleJumpToLatest}
          aria-label="Jump to latest trade"
        >
          ↑ Latest
        </button>
      )}
    </div>
  )
}
