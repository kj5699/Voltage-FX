# PRD — Real-Time Crypto Derivatives Trading Dashboard

---

## Problem Statement

Crypto derivatives traders need to monitor live market conditions across multiple instruments simultaneously. Current tooling either refreshes on a polling cycle (introducing lag) or uses per-panel WebSocket connections (wasting bandwidth and connection slots). When market volatility spikes, naive frontends freeze, drop frames, or show stale data — exactly when accuracy matters most.

The specific pain points:

1. **Data staleness** — Polling-based UIs are 500ms–2s behind the market at normal load; under stress they fall further behind.
2. **UI freezes under load** — Rendering every incoming message directly causes main-thread starvation at high update rates (200+ msg/s).
3. **Cross-panel contamination** — A ticker price update should not cause the order book to re-render. In typical React architectures, it does.
4. **Stale data on symbol switch** — Switching the focused instrument often briefly shows the previous symbol's order book or trades before new data arrives.
5. **Unrecoverable disconnects** — When the WebSocket drops (network blip, server restart), most implementations require a full page refresh to reconnect.

---

## Solution

A single-page React + TypeScript dashboard with three interconnected panels — a persistent ticker bar, a live order book, and a live trades feed — all driven by one multiplexed WebSocket connection.

The key architectural bets:

- **Buffer-then-flush** pattern decouples ingestion rate from render rate, keeping the main thread free regardless of how aggressively the backend pushes data.
- **External Zustand store with atomic selectors** makes cross-panel render leakage structurally impossible — each component subscribes to exactly its own slice.
- **Pure pipeline functions** transform raw backend data (tuples, microsecond timestamps, role-based side derivation) into clean domain objects before anything touches the store.
- **Singleton WebSocketManager** owns all connection lifecycle — reconnect backoff, heartbeat, subscription replay — independently of the React tree.

The result: a dashboard that stays responsive and accurate when the backend is cranked to stress-test extremes, and recovers automatically from network disruptions without user intervention.

---

## User Stories

### Ticker Bar

1. As a trader, I want to see live prices for all 6 instruments (BTCUSD, ETHUSD, XRPUSD, SOLUSD, PAXGUSD, DOGEUSD) in a persistent horizontal bar, so that I can monitor the whole market at a glance without switching views.
2. As a trader, I want each ticker card to show the instrument's last traded price and 24-hour percentage change, so that I can quickly assess momentum.
3. As a trader, I want positive 24h changes shown in green and negative in red, so that direction is scannable without reading numbers.
4. As a trader, I want ticker prices to update in real time as WebSocket messages arrive, so that I always see the latest market price without refreshing.
5. As a trader, I want to click any ticker card to set that instrument as the focused product, so that the order book and trades feed below update to show that instrument's data.
6. As a trader, I want the focused ticker card to be visually distinct from the rest, so that I always know which instrument the panels below are showing.
7. As a trader, I want my selected instrument to be remembered across page reloads, so that I don't have to re-select it every session.
8. As a trader, I want a BTCUSD price update to not cause the ETHUSD card to flicker or re-render, so that the bar remains visually stable at high update rates.

### Order Book

9. As a trader, I want to see the live order book for the focused instrument with asks above and bids below, so that I can read market depth in the standard trading layout.
10. As a trader, I want each order book level to show price, size at that level, cumulative size from the top of the book, and a depth bar, so that I can visually gauge where liquidity is concentrated.
11. As a trader, I want the depth bars to be proportional to cumulative volume, so that the widest bar always represents the deepest level and relative depth is immediately apparent.
12. As a trader, I want to see the mid-price, absolute spread, spread in basis points, and order book imbalance between the ask and bid sides, so that I can assess fair value and market pressure at a glance.
13. As a trader, I want to select a grouping increment from a dropdown, so that I can view the book at different price granularities depending on market conditions.
14. As a trader, I want the grouping increment options to be appropriate for the focused instrument's price precision (e.g. 0.0001–0.1 for XRPUSD, 1–500 for BTCUSD), so that the grouping choices are always meaningful for the current instrument.
15. As a trader, I want the grouping to reset to the finest increment automatically when I switch instruments, so that I never see BTCUSD's $500 grouping applied to an XRPUSD book.
16. As a trader, I want aggregated sizes, cumulative depths, depth bars, and spread metrics to all update correctly under any grouping selection, so that I can trust the numbers regardless of how I've configured the view.
17. As a trader, I want a brief green flash on any order book row whose size increases by more than 10%, so that I can spot aggressive size additions without watching every level continuously.
18. As a trader, I want a brief red flash on any order book row whose size decreases by more than 10%, so that I can spot large pulls or partial fills.
19. As a trader, I want the order book to show a loading state immediately when I switch instruments, with no stale data from the previous instrument visible, so that I always know whether the data I'm reading is current.
20. As a trader, I want the order book to remain smooth and stable during rapid updates — no scroll jumping, no layout shifts, no flickering rows — so that I can read it under volatile conditions.

### Trades Feed

21. As a trader, I want to see a live feed of recent trades for the focused instrument, so that I can read recent execution history.
22. As a trader, I want each trade row to show the execution time (HH:MM:SS.ms), price, size, and direction, so that I have full context on each execution.
23. As a trader, I want buy-aggressed trades shown in green and sell-aggressed trades shown in red, so that direction is scannable at a glance.
24. As a trader, I want trades at the same price within a 100ms window to merge into a single row showing combined size and trade count, so that the feed doesn't flood with micro-executions at the same level.
25. As a trader, I want merged rows to show the count of constituent trades (e.g. "(3)"), so that I know how many executions the row represents.
26. As a trader, I want to configure a notional threshold (price × size) above which trades are highlighted as large, so that significant executions stand out without me watching every row.
27. As a trader, I want large trades to display with a distinct visual treatment (bold text, highlighted background), so that I notice them even when the feed is scrolling fast.
28. As a trader, I want the feed to auto-scroll to the latest trade as new executions arrive, so that I always see the most recent activity.
29. As a trader, I want auto-scroll to pause when I scroll up manually, so that I can inspect historical trades without losing my place.
30. As a trader, I want a "Jump to latest" button to appear when auto-scroll is paused, so that I can return to the live feed with a single click.
31. As a trader, I want auto-scroll to resume automatically when I scroll back to the bottom, so that I don't have to click the button if I scroll back naturally.
32. As a trader, I want a rolling stats bar above the feed showing last-60-second buy volume, sell volume, trade count, and average trade size, so that I can assess recent market activity without counting individual rows.
33. As a trader, I want the rolling stats bar to update every second, so that it reflects current activity without flickering on every individual trade.
34. As a trader, I want the stats to correctly include only trades from the last 60 seconds and automatically drop older trades from the calculation, so that the window is always accurate.

### WebSocket & Connection

35. As a trader, I want all market data to arrive over a single WebSocket connection, so that the app doesn't exhaust connection limits or create subscription race conditions.
36. As a trader, I want a visible connection status indicator showing Connected, Reconnecting, or Disconnected, so that I always know whether the data I'm seeing is live.
37. As a trader, I want the app to automatically reconnect if the connection drops, so that a network blip or server restart doesn't require a page refresh.
38. As a trader, I want automatic reconnection to use exponential backoff (1s → 2s → 4s → … → 30s cap), so that the app doesn't hammer a recovering server.
39. As a trader, I want all channel subscriptions to be automatically re-established after reconnection, so that I don't have to manually re-subscribe or reload.
40. As a trader, I want silent connection drops (no close frame) to be detected via heartbeat, so that a stale connection doesn't leave me watching frozen data.
41. As a trader, I want switching the focused instrument to immediately unsubscribe the old instrument's channels and subscribe the new ones, so that I never pay for data I'm not looking at.
42. As a trader, I want rapid instrument switching to be safe — if I click three instruments quickly, only the last one's data should appear, so that the UI is never in a confused state.

---

## Implementation Decisions

### 1. State Management — Zustand with Atomic Selectors

An external Zustand store holds all server state outside the React tree. Each component subscribes to a typed selector function that returns exactly the slice it needs. Zustand's `Object.is` equality check ensures a component re-renders only when its own slice reference changes. Cross-panel render leakage is structurally impossible under this model.

Store shape (from architecture prototype):
```
tickers:        Record<Symbol, { lastPrice, change24h }>
orderBook:      { bids, asks, midPrice, spread, spreadBps, imbalance } | null
trades:         AggregatedTrade[]  (capped at 500)
rollingStats:   { buyVolume, sellVolume, tradeCount, avgSize } | null
focusedSymbol:  Symbol
groupingIncrement: number
wsStatus:       'connecting' | 'connected' | 'reconnecting' | 'disconnected'
focusSeqId:     number   ← generation counter for stale-snapshot guard
```

### 2. Update Throttling — useRef Buffer + setInterval Flush

Raw WebSocket messages are pushed into `useRef` arrays (no React state, no renders triggered). Interval-based flush handlers drain the buffer and write one batched update to Zustand per interval:

| Channel | Flush interval | Rationale |
|---------|---------------|-----------|
| Tickers | 200 ms | 5 visual updates/s is sufficient for a price display |
| Order book | 50 ms | 20 updates/s matches human reading speed; budget: <2ms per aggregation |
| Trades | 100 ms | Matches the 100ms aggregation window; budget: <3ms per flush |

Flush handlers check `capturedSeqId === currentFocusSeqId` before writing to store — if they differ, the flush is from a previous symbol focus and is discarded.

### 3. Order Book Aggregation Pipeline

Pure function pipeline, runs inside the 50ms flush:

- **Input**: raw `bids: [price, size][]`, `asks: [price, size][]` tuples from backend snapshot
- **Step 1**: Destructure tuples to objects; parse price/size strings to numbers
- **Step 2**: Scale prices to integers using symbol precision (`price_int = Math.round(price * 10^precision)`) to avoid float rounding in bucket math
- **Step 3**: Group — bids floor, asks ceil to preserve spread invariant
- **Step 4**: Sort — bids descending, asks ascending
- **Step 5**: Prefix-sum cumulative sizes
- **Step 6**: Scale depth bar widths (each side scales to its own max cumulative)
- **Step 7**: Compute metrics (mid-price, spread, spread bps, imbalance)
- **Step 8**: Diff against previous size map → emit flash events for >10% changes
- **Output**: `ProcessedOrderBook` written to store in one `setState` call

### 4. Trade Aggregation Pipeline

Pure function, runs inside the 100ms flush:

- **Side derivation** (no `side` field in backend message): `buyer_role === 'taker'` → `'buy'`; `seller_role === 'taker'` → `'sell'`
- **Timestamp normalisation**: backend sends microseconds — divide by 1000 before all ms arithmetic
- **100ms bucket key**: `Math.floor(timestampMs / 100)` — trades at same price in same bucket merge
- **Rolling deque**: time-ordered array of raw trades; evict entries older than 60s on each flush; recompute stats from remaining entries
- **Array cap**: trades array capped at 500 entries (oldest evicted); `RollingStatsBar` reads from a separate deque, not from the display array

### 5. Ticker Data Parsing

Backend `ltp_change_24h` is a multiplier (e.g. `1.0234` = +2.34%). Must be converted before reaching the store: `change24h = (ltp_change_24h - 1) * 100`. Last traded price comes from the `close` field.

### 6. Symbol Configuration

Precision values must match backend `config.js` exactly. Two values differ from what the assignment wireframe implied:

| Symbol | Precision | Default grouping increment |
|--------|-----------|--------------------------|
| BTCUSD | 1 | 1 |
| ETHUSD | 2 | 0.5 |
| XRPUSD | 4 | 0.0001 |
| SOLUSD | **4** | 0.001 |
| PAXGUSD | 2 | 0.5 |
| DOGEUSD | **6** | 0.000001 |

### 7. WebSocketManager Singleton

Plain TypeScript class, instantiated once at app start, lives outside React. Responsibilities:

- Maintains a `Map<"channel:symbol", handler>` subscription registry
- On `onOpen`: replays all registry entries as subscribe frames
- On `onClose`: schedules reconnect with exponential backoff (1s → 30s cap)
- Heartbeat: sends ping every 30s; forces close if no pong within 5s → triggers reconnect path
- Subscribe/unsubscribe methods are synchronous; they update the registry and send the appropriate WS frame

### 8. Focus-Switch Sequence

10-step atomic sequence executed in a single event-loop tick on instrument change:

1. Increment `focusSeqId` (stale-snapshot guard)
2. Unsubscribe old `l2_orderbook` channel
3. Unsubscribe old `all_trades` channel
4. Clear store: `orderBook → null`, `trades → []`, `rollingStats → null`
5. Drain `orderBookBuffer`
6. Drain `tradesBuffer`
7. Reset `groupingIncrement` to finest increment for new symbol
8. Persist new `focusedSymbol` to `localStorage`
9. Subscribe `l2_orderbook` for new symbol
10. Subscribe `all_trades` for new symbol

### 9. Trade List Rendering

`react-window` `FixedSizeList` — only ~15 DOM nodes mounted regardless of array size. Auto-scroll managed via `listRef.scrollToItem()`. A scroll event listener tracks distance from bottom; > 30px from bottom → pause auto-scroll, show "Jump to latest" button.

### 10. Flash Highlight Mechanism

After each aggregation run, compare new size map to previous size map per grouped price level. If `|newSize - prevSize| / prevSize > 0.10`, apply a CSS class to that row (`flash-green` or `flash-red`). A `setTimeout(400ms)` removes the class. No state involved — DOM class toggled directly via ref.

---

## Testing Decisions

### What makes a good test

Tests verify **external behaviour observable at a public boundary** — what a caller passes in and what comes back, or what the DOM shows after a user interaction. Tests must not assert on internal variable names, intermediate state, or implementation order. If an implementation can be refactored without changing a test, the test is at the right level.

### Test seams (highest possible)

| Seam | What is tested |
|------|---------------|
| **Pipeline pure functions** | Aggregation correctness, grouping math, flash detection, side derivation, timestamp conversion, change multiplier conversion — all input/output, no React |
| **WebSocketManager class** | Routing, subscribe/unsubscribe wire format, reconnect backoff, heartbeat timeout, subscription replay on reconnect |
| **Zustand store actions** | State shape, selector isolation (updating one slice must not change another slice's reference), localStorage persistence |
| **React hooks** (with MSW WS mock) | Buffer→flush→store integration; subscription lifecycle on mount/unmount/symbol-change |
| **Components** (React Testing Library) | DOM assertions on rendered output; render isolation verified by counting renders per component across cross-panel updates |
| **E2E** (Playwright, real backend) | Full round-trip from backend data to DOM; reconnect recovery; symbol persistence across reload |

### Modules with coverage targets

| Module | Target | Why |
|--------|--------|-----|
| `pipelines/` | ≥ 95% | Pure functions — exhaustive coverage is cheap and critical |
| `WebSocketManager` | ≥ 90% | Complex lifecycle, hard to debug visually |
| `store/` | ≥ 90% | Selector isolation bugs are silent |
| `hooks/` | ≥ 80% | Integration boundary |
| `components/` | ≥ 75% | Behaviour tests, not snapshot tests |

### Protocol compliance tests (must run first)

Five tests verify backend contract before any pipeline logic is tested:

- Orderbook tuple `[price, size]` destructuring produces correct objects
- Trade `buyer_role`/`seller_role` → `side` derivation (both directions)
- Ticker `ltp_change_24h` multiplier → percentage conversion
- Microsecond timestamp → millisecond normalisation
- 100ms trade bucket groups correctly using millisecond timestamps (not raw μs values)

These five tests encode facts about the backend wire format. If they fail, every downstream test is meaningless.

---

## Out of Scope

- **Order placement or simulation** — this is a read-only market data dashboard
- **Candlestick / chart rendering** — the backend supports candlestick channels but the dashboard does not use them
- **Authentication or session management** — the backend requires no auth
- **Mobile / React Native build** — web only
- **Backend modifications** — the backend is a fixed external dependency
- **Multi-user or shared state** — single-browser, single-session
- **Visual polish beyond usability** — the wireframe is a layout reference, not a design spec
- **Error boundaries** — backend data is clean generated output; defensive React error boundaries are good practice but not required for correctness
- **Tab visibility change handling** — graceful background-tab recovery is a known limitation, documented in KNOWN-ISSUES.md
- **CI/CD pipeline** — out of scope for the assignment deliverable
- **Accessibility** — no a11y requirements specified in the brief

---

## Further Notes

### Why the backend source matters

Reading the backend source directly resolved four assumptions that would have produced silent bugs in production:

1. **No `side` field** — colour-coded trade direction would have been missing without deriving side from `buyer_role`/`seller_role`
2. **Microsecond timestamps** — 100ms trade aggregation would never have merged any trades using raw timestamps
3. **Tuple format** — the entire order book panel would have been blank (`.price` on an array is `undefined`)
4. **Multiplier not percentage** — 24h change would have displayed as ~100× the real value

These are not edge cases; they affect every single message from the backend.

### Scaling note (50 symbols)

The current architecture keeps all aggregation on the main thread. At 8 channels this stays within a 13ms budget per 50ms frame. At 50 symbols × 3 channels = 150 channels, the main thread saturates. The redesign path — Web Worker + SharedArrayBuffer + WebGL OffscreenCanvas — is documented in the architecture doc but not implemented here. This is a conscious, documented trade-off.

### Known limitations

See `docs/KNOWN-ISSUES.md` (to be written alongside implementation) for:
- Background tab buffer accumulation and tab-refocus freeze
- Basis-point display accuracy at high grouping increments
- Rolling stats using client-side deque (could drift from server-side truth under extreme load)
