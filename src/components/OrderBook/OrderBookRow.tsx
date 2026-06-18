import { memo } from 'react'
import type { ProcessedLevel } from '@pipelines/orderBookPipeline'

interface OrderBookRowProps {
  level: ProcessedLevel
  side: 'bid' | 'ask'
  precision: number
  rowRef: (el: HTMLTableRowElement | null) => void
}

export const OrderBookRow = memo(function OrderBookRow({
  level,
  side,
  precision,
  rowRef,
}: OrderBookRowProps) {
  return (
    <tr className={`ob-row ob-row--${side}`} ref={rowRef}>
      <td className="ob-row__depth-cell">
        <div
          className={`ob-row__depth-bar ob-row__depth-bar--${side}`}
          style={{ width: `${level.depthWidth}%` }}
        />
      </td>
      <td className="ob-row__price">{level.price.toFixed(precision)}</td>
      <td className="ob-row__size">{level.size.toFixed(4)}</td>
      <td className="ob-row__cumulative">{level.cumulativeSize.toFixed(4)}</td>
    </tr>
  )
})
