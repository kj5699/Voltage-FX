# Issue 25 — OrderBookRow: makeRowRef defeats memo (new function per render)

**Type:** Performance / Should-fix
**Blocked by:** Nothing
**Priority:** Low — functional but wastes 300 ref callbacks/second at stress rates

---

## Problem

`src/components/OrderBook/OrderBookPanel.tsx` defines `makeRowRef` inline:

```tsx
const makeRowRef = (price: number) => (el: HTMLTableRowElement | null) => {
  rowRefs.current.set(price, el)
}
```

This function is called once per row in JSX:

```tsx
<OrderBookRow
  key={level.price}
  level={level}
  side="ask"
  precision={precision}
  rowRef={makeRowRef(level.price)}   // new function object on every render
/>
```

`makeRowRef(level.price)` creates a new arrow function each time `OrderBookPanel` renders.
`OrderBookRow` is wrapped in `React.memo`, but memo compares props with `Object.is`.
Because `rowRef` is a different function object on every render, `Object.is` returns false
and memo bails out — `OrderBookRow` re-renders unconditionally on every 50ms order book flush.

React also interprets the changed ref callback as a ref lifecycle: it calls the old callback
with `null` (detach) then the new callback with the DOM element (attach). At 15 rows × 20
flushes/s = **300 unnecessary ref attach/detach cycles per second**.

## Fix

Cache ref callbacks in a `useRef` Map, keyed by price. Return the cached function if it
exists; otherwise create and store it.

```tsx
const rowRefCallbacks = useRef(new Map<number, (el: HTMLTableRowElement | null) => void>())

function getRowRef(price: number) {
  let cb = rowRefCallbacks.current.get(price)
  if (!cb) {
    cb = (el) => { rowRefs.current.set(price, el) }
    rowRefCallbacks.current.set(price, cb)
  }
  return cb
}
```

Replace `makeRowRef(level.price)` with `getRowRef(level.price)` in JSX.

The cache accumulates entries as grouped price levels change. Stale entries (prices that
are no longer visible) can be evicted at flush time if memory growth is a concern, but for
≤15 rows at a time the Map stays small.

## Acceptance criteria

- [ ] `OrderBookRow` renders in Profiler are caused only by `level` prop changes — not
  by the parent flush
- [ ] No `makeRowRef` call in JSX (replaced with `getRowRef` or equivalent)
- [ ] Flash highlights still work (row DOM nodes are correctly captured via ref)
- [ ] All existing OrderBook tests pass

## Performance impact

At 15 rows × 20 flushes/s:
- Before: 300 ref callbacks + 300 `OrderBookRow` memo bailouts per second
- After: 0 unnecessary callbacks; `OrderBookRow` only re-renders when its `level` prop
  changes (which is when the grouped price level's size or cumulative actually changed)

## Files

- `src/components/OrderBook/OrderBookPanel.tsx`
