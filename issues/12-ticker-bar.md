# Issue 12 — Ticker Bar: Live Prices, Colour Coding, Focus Selection, Persistence

**Type:** AFK
**Blocked by:** Issues 10, 11

---

## What to build

Implement the full ticker bar — the persistent horizontal strip at the top of the viewport that shows live prices for all 6 symbols and controls the focused product.

Includes:
- `useTickerBar` hook: subscribes to `v2/ticker` for all 6 symbols via `WebSocketManager`, accumulates messages in a `useRef` buffer, flushes every 200ms via `setInterval`, calls `mergeLatestTickers` on the buffer, writes result to store via `updateTickers`
- `TickerBar` component: renders 6 `TickerCell` children
- `TickerCell` component: subscribes to `useTicker(symbol)` — one selector per cell

Each `TickerCell` shows: symbol name, last price (formatted to symbol precision), 24h change % with sign (green if ≥ 0, red if < 0).

Clicking a cell calls `setFocusedSymbol`. The focused cell has a distinct visual state (border, background, or highlight — implementation choice).

`useTickerBar` must be mounted once in the app root. Unmount must clear the flush interval and unsubscribe all 6 symbols.

## Acceptance criteria

- [ ] All 6 ticker cells render on load (T5-1)
- [ ] Positive `change24h` → green colour class; negative → red colour class (T5-2)
- [ ] Clicking ETHUSD cell calls `setFocusedSymbol('ETHUSD')` (T5-3)
- [ ] Focused cell has a visually distinct CSS class; no other cell has it (T5-4)
- [ ] **Render isolation**: updating `tickers.BTCUSD` does not increment render count of `TickerCell symbol="ETHUSD"` (T5-5)
- [ ] Prices update within 200ms of a WS message arriving (manual check with DevTools)
- [ ] On unmount: flush interval cleared, all 6 `v2/ticker` unsubscriptions sent
- [ ] On page reload: focused symbol restored from `localStorage` and correct cell is highlighted
- [ ] Price formatted to correct decimal places per symbol (e.g. BTCUSD 1dp, DOGEUSD 6dp)

## Testing scope

Tests T5-1 through T5-5 from `docs/05-TDD-PLAN.md`.
Integration test T6-1: MSW sends a `v2/ticker` message → correct price appears in the DOM.
