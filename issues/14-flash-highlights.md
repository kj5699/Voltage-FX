# Issue 14 — Order Book Flash Highlights + Layout Stability

**Type:** AFK
**Blocked by:** Issues 07, 13

---

## What to build

Wire flash highlight detection into the order book flush cycle and apply visual feedback to rows without layout shifts, scroll jumps, or flicker.

The flush handler in `useOrderBook` already keeps `prevSizeMap` in a `useRef`. After each `aggregateOrderBook` call, pass the previous and new size maps to `detectFlashes`. For each level in the flash result, apply a CSS class (`flash-green` or `flash-red`) to the corresponding row DOM node via a ref — not via React state (which would trigger a re-render of the entire table).

Implementation:
- Each bid/ask row holds a `ref` to its DOM node
- After flush writes to store, flash handler iterates `detectFlashes` result, adds class, schedules `setTimeout(removeClass, 400)`
- If a new flash arrives for the same level before the timeout fires, clear the old timeout and restart — prevents class accumulation

Layout stability constraints:
- Row heights must be fixed (no `auto` height that changes on data update)
- Depth bar changes must use CSS `width` transitions (max 150ms) — not layout-triggering properties
- Scroll position must not jump during rapid updates — test by scrolling to mid-book and running stress rate

## Acceptance criteria

- [ ] Row flashes green when size increases > 10% (T5-12)
- [ ] Flash class is removed after 400ms (T5-12)
- [ ] Row flashes red when size decreases > 10%
- [ ] Change ≤ 10% produces no flash
- [ ] Rapid consecutive flashes on the same row do not accumulate multiple CSS classes
- [ ] Flash applied via DOM class toggle — not via React state update (verify: flash must not increment render count of `OrderBookPanel`)
- [ ] No layout shift during flash (row height unchanged)
- [ ] No scroll jump when new levels appear or sizes change
- [ ] All flash timeouts cleared on component unmount (no memory leak)

## Testing scope

Test T5-12 from `docs/05-TDD-PLAN.md`.
Additional: rapid flash test (10 consecutive >10% changes on same level — only one class at end).
Additional: unmount test (no pending timeouts after unmount — check via `vi.useFakeTimers()`).
