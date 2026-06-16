# Issue 15 — Trades Feed: Display, Aggregation, Large Trade Highlight, Threshold Config

**Type:** AFK
**Blocked by:** Issues 08, 11

---

## What to build

Implement the trades feed panel — the live execution history for the focused symbol. Trades aggregate within 100ms windows, large trades are visually highlighted, and the threshold is user-configurable.

Includes:
- `useTrades` hook: subscribes to `all_trades` for focused symbol, accumulates raw parsed trades in a `useRef` buffer, flushes every 100ms, calls `aggregateTrades` with current `notionalThreshold`, writes result to store via `setTrades`
- `TradesFeedPanel` component: reads from `useTrades()` and `useRollingStats()`
- `VirtualTradeList`: `react-window` `FixedSizeList`, row height 35px, renders aggregated trades newest-first
- Each row: timestamp `HH:MM:SS.ms` (derived from `trade.time` ms value), price (formatted to symbol precision), size, side indicator (green=buy, red=sell), count badge if `count > 1` (e.g. `(3)`)
- Large trade row: `isLarge === true` → `large-trade` CSS class (bold text, distinct background)
- `LargeTradeThresholdInput`: number input defaulting to 10000. On change (debounced 300ms): updates local `notionalThreshold` state used by the flush handler. No store entry needed — local to the hook/component.

## Acceptance criteria

- [ ] Buy trades render with green colour class; sell trades with red (T5-13)
- [ ] Aggregated trade with count=3 shows `(3)` badge (T5-14)
- [ ] Trade with notional > threshold has `large-trade` class (T5-15)
- [ ] Trade with notional exactly = threshold does NOT have `large-trade` class (boundary)
- [ ] Trade with notional < threshold has no `large-trade` class
- [ ] Timestamp displays as `HH:MM:SS.ms` format (e.g. `14:32:05.234`)
- [ ] `VirtualTradeList` uses `react-window` — DOM has ≈15 rows regardless of array length
- [ ] Changing threshold input to 50000 removes `large-trade` from trades below 50000 notional (T5-18)
- [ ] **Render isolation**: trades update does not re-render `OrderBookPanel` or any `TickerCell`
- [ ] On unmount: flush interval cleared, `all_trades` unsubscription sent

## Testing scope

Tests T5-13 through T5-15, T5-18 from `docs/05-TDD-PLAN.md`.
Additional: boundary test (notional exactly = threshold → no class).
Additional: DOM node count test (500 trades → still only ~15 DOM rows rendered).
