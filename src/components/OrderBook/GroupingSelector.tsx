import { memo } from 'react'
import { useFocusedSymbol, useGroupingIncrement } from '@store/index'
import { SYMBOL_CONFIG } from '@config/symbols'
import { useStore } from '@store/store'

export const GroupingSelector = memo(function GroupingSelector() {
  const focusedSymbol = useFocusedSymbol()
  const groupingIncrement = useGroupingIncrement()
  const { increments } = SYMBOL_CONFIG[focusedSymbol]

  return (
    <div className="grouping-selector">
      <label className="grouping-selector__label" htmlFor="grouping-select">
        Group
      </label>
      <select
        id="grouping-select"
        className="grouping-selector__select"
        value={groupingIncrement}
        onChange={(e) => useStore.getState().setGroupingIncrement(Number(e.target.value))}
      >
        {increments.map((inc) => (
          <option key={inc} value={inc}>{inc}</option>
        ))}
      </select>
    </div>
  )
})
