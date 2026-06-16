# Issue 03 — CLAUDE.md Files Per System Area

**Type:** AFK
**Blocked by:** Issue 02 (directory skeleton must exist)

---

## What to build

Write a focused `CLAUDE.md` inside each major source directory. These files are instructions for an AI agent (or a new developer) picking up work in that area. Each file must be self-contained — the reader should not need to cross-reference other files to understand the constraints and decisions for that area.

## Files to create

### `src/ws/CLAUDE.md`
Cover:
- `WebSocketManager` is a **singleton plain TypeScript class**, not a React hook or context
- Single connection multiplexes all 8 channels — never open a second socket
- Subscription registry key format: `"channel:symbol"` (e.g. `"l2_orderbook:BTCUSD"`)
- On reconnect: `onOpen` replays every entry in the registry automatically
- Backoff schedule: 1s → 2s → 4s → 8s → 16s → 30s (capped), reset to 1s on successful open
- Heartbeat: ping every 30s; force-close if no pong within 5s
- Subscribe/unsubscribe wire format (exact JSON shapes from backend README)
- **Never** call `zustand.setState` from inside this class — it dispatches to handlers only

### `src/pipelines/CLAUDE.md`
Cover:
- All pipeline functions are **pure functions** — same input, same output, no side effects
- They receive raw backend data and return clean domain objects
- Protocol facts that must be handled here (not assumed away):
  - Orderbook: `bids/asks` are `[price, size][]` tuples — destructure, never `.price`/`.size`
  - Timestamps: microseconds — divide by 1000 before **any** ms arithmetic
  - Trades: no `side` field — derive: `buyer_role === 'taker'` → `'buy'`, `seller_role === 'taker'` → `'sell'`
  - Ticker: `ltp_change_24h` is a multiplier — `(v - 1) * 100` gives percentage; last price = `close`
- Grouping math uses **integer-scaled arithmetic** to avoid float errors (see `docs/04-ARCHITECTURE.md §6`)
- Bids: `Math.floor`, Asks: `Math.ceil` — this invariant keeps spread non-negative
- Symbol precision table (must match backend `config.js` exactly):
  - BTCUSD=1, ETHUSD=2, XRPUSD=4, SOLUSD=**4**, PAXGUSD=2, DOGEUSD=**6**
- Tests for pipelines live in `src/pipelines/__tests__/` and must achieve ≥95% coverage

### `src/store/CLAUDE.md`
Cover:
- Zustand store is the **only** place components read server state
- `Object.is` equality check — selectors must return a stable reference when data hasn't changed
- Never put computed/derived values directly in the store — compute in pipelines, store results
- `focusSeqId` is a generation counter for the focus-switch stale-snapshot guard — increment it **first** in the focus-switch sequence, before any unsubscribe or clear
- `focusedSymbol` must be persisted to `localStorage` on every `setFocusedSymbol` call and restored on store init
- `trades` array capped at 500 entries — `setTrades` must enforce this
- `groupingIncrement` resets to `SYMBOL_CONFIG[newSymbol].increments[0]` on symbol change

### `src/components/CLAUDE.md`
Cover:
- **Render isolation is the top constraint.** A BTCUSD ticker update must not re-render ETHUSD cell or either panel. Verify with React DevTools Profiler.
- Each component subscribes to exactly one Zustand selector — never subscribe to the whole store
- `TickerCell` — one per symbol, selector: `state => state.tickers[symbol]`
- `OrderBookPanel` — selector: `state => state.orderBook`
- `TradesFeedPanel` — selector: `state => state.trades` + `state => state.rollingStats`
- Flash highlights are applied via CSS class + `setTimeout(400ms)` DOM manipulation — not via React state
- `VirtualTradeList` uses `react-window` `FixedSizeList` — do not replace with a plain `<ul>`, ever
- Auto-scroll: `listRef.scrollToItem(trades.length - 1, 'end')` — do not use `scrollIntoView`
- Loading state for OrderBook: when `store.orderBook === null`, show skeleton — never show stale data

## Acceptance criteria

- [ ] `src/ws/CLAUDE.md` covers all items listed above
- [ ] `src/pipelines/CLAUDE.md` covers all items including protocol facts and symbol precision table
- [ ] `src/store/CLAUDE.md` covers focusSeqId, localStorage persistence, trades cap, grouping reset
- [ ] `src/components/CLAUDE.md` covers render isolation rule with explicit Profiler verification instruction
- [ ] Each file is self-contained — no "see other files for details" without also giving the key fact inline
- [ ] All four files are ≤150 lines each (dense, not exhaustive prose)

## Testing scope

No automated tests. Reviewed manually for completeness against the list above.
