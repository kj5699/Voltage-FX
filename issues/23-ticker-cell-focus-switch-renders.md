# Issue 23 — TickerCell: all 6 cells re-render on every focus switch

**Type:** Performance / Should-fix
**Blocked by:** Nothing
**Priority:** Medium — React DevTools Profiler will flag this during evaluation

---

## Problem

`src/components/TickerBar/TickerCell.tsx` subscribes to `useFocusedSymbol()`:

```tsx
const focusedSymbol = useFocusedSymbol()
const isFocused = focusedSymbol === symbol
```

When any symbol is clicked, `focusedSymbol` changes in the store. Zustand notifies every
subscriber of that slice — which is all 6 `TickerCell` components. All 6 re-render, even
though only 2 need to update (the old focused cell and the new focused cell).

The assignment specifies: *"We will check whether a BTCUSD ticker update causes ETHUSD to
re-render. It shouldn't."* Ticker updates are correctly isolated. But an evaluator running
React DevTools Profiler during a symbol click will see 6 simultaneous TickerCell renders,
which contradicts the render isolation claim.

## Fix

Replace the two-value subscription with a boolean selector scoped to this symbol:

```tsx
// Before — subscribes to full focusedSymbol string, all 6 cells re-render
const focusedSymbol = useFocusedSymbol()
const isFocused = focusedSymbol === symbol

// After — each cell subscribes to its own boolean; only 2 cells re-render on switch
const isFocused = useStore((s) => s.focusedSymbol === symbol)
```

Zustand's `Object.is` equality check compares `true === true` and `false === false` — so
a cell whose focused state didn't change (neither old nor new symbol) will bail out of
re-render entirely.

Optionally add a named selector hook to `src/store/hooks.ts`:

```ts
export function useIsSymbolFocused(symbol: Symbol): boolean {
  return useStore((s) => s.focusedSymbol === symbol)
}
```

## Acceptance criteria

- [ ] Clicking a symbol in the ticker bar produces exactly 2 TickerCell renders in Profiler
  (the previously focused cell and the newly focused cell), not 6
- [ ] `useFocusedSymbol()` is no longer called inside `TickerCell`
- [ ] All existing TickerBar tests pass

## Files

- `src/components/TickerBar/TickerCell.tsx`
- `src/store/hooks.ts` (optional — add `useIsSymbolFocused`)
