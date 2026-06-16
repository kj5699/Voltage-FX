# Issue 16 — Trades Feed: Auto-Scroll, Jump to Latest, Rolling Stats Bar

**Type:** AFK
**Blocked by:** Issues 09, 15

---

## What to build

Layer the scroll management and rolling stats bar on top of the trades feed from Issue 15.

**Auto-scroll:** On each flush that adds new trades, if `isAutoScrollLocked === true`, call `listRef.scrollToItem(trades.length - 1, 'end')`. Never call this when the user is browsing history.

**Scroll position detection:** Attach an `onScroll` handler to the `FixedSizeList`. Calculate distance from bottom: `scrollHeight - scrollTop - clientHeight`. If > 30px → set `isAutoScrollLocked = false`. If ≤ 30px → set `isAutoScrollLocked = true`.

**Jump to latest button:** Rendered as an overlay inside `TradesFeedPanel`. Visible only when `isAutoScrollLocked === false`. On click: `listRef.scrollToItem(trades.length - 1, 'end')` then `setIsAutoScrollLocked(true)`.

**Rolling stats bar (`RollingStatsBar`):**
- Subscribes to `useRollingStats()` from store
- Has its own `setInterval(1000)` that copies the latest `rollingStats` value into local state for display
- Displays: buy volume, sell volume, trade count, avg trade size
- Shows `—` for each field while `rollingStats === null` (no data yet)

`isAutoScrollLocked` is local component state — not in Zustand. It resets to `true` when the focused symbol changes (new feed, start locked).

## Acceptance criteria

- [ ] Auto-scroll active by default on mount (T4-4)
- [ ] Scrolling up > 30px from bottom → "Jump to latest" button appears (T5-16)
- [ ] "Jump to latest" button click scrolls to bottom and hides button (T5-17)
- [ ] Scrolling back to bottom manually hides button and resumes auto-scroll
- [ ] Auto-scroll uses `listRef.scrollToItem` — not `scrollIntoView` or `scrollTop` manipulation
- [ ] `RollingStatsBar` updates at 1s cadence — not on every 100ms flush (T2-19 / render count check)
- [ ] Stats show `—` when `rollingStats` is null
- [ ] Stats reflect correct buy/sell split and trade count
- [ ] `isAutoScrollLocked` resets to `true` when `focusedSymbol` changes

## Testing scope

Tests T5-16, T5-17 from `docs/05-TDD-PLAN.md`.
Additional: stats-cadence test (verify `RollingStatsBar` re-renders at 1s, not at 100ms flush rate).
Additional: auto-scroll reset test (symbol change → scroll locked again).
