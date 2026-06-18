import { useCallback, useRef } from 'react'
import { useOrderBook, useFocusedSymbol } from '@store/index'
import { useOrderBookFlush } from '@hooks/useOrderBookFlush'
import { SYMBOL_CONFIG } from '@config/symbols'
import { GroupingSelector } from './GroupingSelector'
import { SpreadBar } from './SpreadBar'
import { OrderBookRow } from './OrderBookRow'
import type { FlashResult } from '@utils/detectFlashes'

const FLASH_DURATION_MS = 400
const MAX_ROWS = 15

export function OrderBookPanel() {
  const orderBook = useOrderBook()
  const focusedSymbol = useFocusedSymbol()
  const precision = SYMBOL_CONFIG[focusedSymbol].precision

  const rowRefs = useRef(new Map<number, HTMLTableRowElement | null>())
  const flashTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const applyFlashes = useCallback((
    bids: FlashResult,
    asks: FlashResult,
  ) => {
    const allFlashes = new Map([...bids, ...asks])
    for (const [price, direction] of allFlashes) {
      const el = rowRefs.current.get(price)
      if (!el) continue

      const existing = flashTimers.current.get(price)
      if (existing !== undefined) {
        clearTimeout(existing)
        el.classList.remove('flash-green', 'flash-red')
      }

      el.classList.add(`flash-${direction}`)
      const timer = setTimeout(() => {
        el.classList.remove(`flash-${direction}`)
        flashTimers.current.delete(price)
      }, FLASH_DURATION_MS)
      flashTimers.current.set(price, timer)
    }
  }, [])

  useOrderBookFlush(applyFlashes)

  const makeRowRef = (price: number) => (el: HTMLTableRowElement | null) => {
    rowRefs.current.set(price, el)
  }

  if (!orderBook) {
    return (
      <div className="ob-panel ob-panel--loading">
        <div className="ob-panel__header">
          <span className="ob-panel__title">Order Book</span>
          <GroupingSelector />
        </div>
        <div className="ob-skeleton">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="ob-skeleton__row" />
          ))}
        </div>
      </div>
    )
  }

  const displayAsks = orderBook.asks.slice(0, MAX_ROWS)
  const displayBids = orderBook.bids.slice(0, MAX_ROWS)

  return (
    <div className="ob-panel">
      <div className="ob-panel__header">
        <span className="ob-panel__title">Order Book</span>
        <GroupingSelector />
      </div>

      <table className="ob-table ob-table--asks" aria-label="Ask orders">
        <thead>
          <tr>
            <th>Price</th>
            <th>Size</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {displayAsks.map((level) => (
            <OrderBookRow
              key={level.price}
              level={level}
              side="ask"
              precision={precision}
              rowRef={makeRowRef(level.price)}
            />
          ))}
        </tbody>
      </table>

      <SpreadBar data={orderBook} />

      <table className="ob-table ob-table--bids" aria-label="Bid orders">
        <thead>
          <tr>
            <th>Price</th>
            <th>Size</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {displayBids.map((level) => (
            <OrderBookRow
              key={level.price}
              level={level}
              side="bid"
              precision={precision}
              rowRef={makeRowRef(level.price)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
