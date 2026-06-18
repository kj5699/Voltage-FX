import { memo } from 'react'
import type { ProcessedLevel } from '@pipelines/orderBookPipeline'

interface OrderBookRowProps {
  level: ProcessedLevel
  side: 'bid' | 'ask'
  precision: number
  rowRef: (el: HTMLTableRowElement | null) => void
}

const BID_COLOR = 'rgba(38,166,154,0.12)'
const ASK_COLOR = 'rgba(239,83,80,0.12)'

export const OrderBookRow = memo(function OrderBookRow({
  level,
  side,
  precision,
  rowRef,
}: OrderBookRowProps) {
  const color = side === 'bid' ? BID_COLOR : ASK_COLOR
  const bg = `linear-gradient(to right, ${color} ${level.depthWidth}%, transparent ${level.depthWidth}%)`

  return (
    <tr className={`ob-row ob-row--${side}`} ref={rowRef} style={{ background: bg }}>
      <td className="ob-row__price">{level.price.toFixed(precision)}</td>
      <td className="ob-row__size">{level.size.toFixed(4)}</td>
      <td className="ob-row__cumulative">{level.cumulativeSize.toFixed(4)}</td>
    </tr>
  )
})
