# Goal Document — Real-Time Crypto Derivatives Trading Dashboard

## Project Summary

Build a browser-based (React + TypeScript) real-time trading dashboard that consumes a
stress-test WebSocket backend at intentionally aggressive data rates. The finished product
must demonstrate depth of engineering — specifically around real-time state management,
render isolation, and performance under load — not UI polish.

---

## Functional Goals

These describe **what the system does** — observable behaviours a user or tester can verify
directly in the UI.

### FG-1 — Multi-Product Ticker Bar

| Sub-goal | Success Criterion |
|----------|-------------------|
| FG-1a: Display all 6 symbols | BTCUSD, ETHUSD, XRPUSD, SOLUSD, PAXGUSD, DOGEUSD each have a visible ticker card |
| FG-1b: Show last price and 24 h change | Each card shows the most recent price and a colour-coded percentage change (green = positive, red = negative) |
| FG-1c: Prices update in real time | Visible price values change as WebSocket messages arrive — no manual refresh required |
| FG-1d: Clicking a ticker focuses it | Clicking ETHUSD highlights that card and loads ETHUSD data into the panels below |
| FG-1e: Focus persists across reloads | Refreshing the page restores the last-selected symbol from `localStorage` |

### FG-2 — Live Order Book

| Sub-goal | Success Criterion |
|----------|-------------------|
| FG-2a: Asks above, bids below | Asks render in ascending price order (lowest first); bids in descending order (highest first) |
| FG-2b: Level data shown | Each row shows price, size, cumulative size, and a depth bar proportional to cumulative volume |
| FG-2c: Spread metrics shown | Mid-price, absolute spread, spread in basis points, and order-book imbalance are always visible |
| FG-2d: Grouping selector works | User can pick a grouping increment from a dropdown; levels aggregate correctly |
| FG-2e: Grouping options adapt to symbol | BTCUSD shows [1, 5, 10, 50, 100, 500]; XRPUSD shows [0.0001, 0.001, 0.01, 0.1]; etc. |
| FG-2f: Grouped metrics are correct | Cumulative sizes, depth bars, spread, and imbalance all recalculate correctly after grouping |
| FG-2g: Flash highlights on size change | A row flashes green if its size increases by > 10%; red if it decreases by > 10% |
| FG-2h: No stale data on symbol switch | Switching focus immediately clears old book data and shows a loading state until new data arrives |

### FG-3 — Live Trades Feed

| Sub-goal | Success Criterion |
|----------|-------------------|
| FG-3a: Each trade shows time, price, size, side | Timestamp is HH:MM:SS.ms; buy rows are green, sell rows are red |
| FG-3b: 100 ms trade aggregation | Trades at the same price within a 100 ms window merge into one row showing combined size and count |
| FG-3c: Large trade highlighting | Trades whose notional value (price × size) exceeds the user-set threshold render with bold/highlighted styling |
| FG-3d: Configurable large-trade threshold | A threshold input lets the user change the notional value that triggers the highlight |
| FG-3e: Auto-scroll to latest | The feed automatically scrolls to show the newest trade |
| FG-3f: Manual scroll pauses auto-scroll | Scrolling up freezes the feed on the user's position; a "Jump to latest" button appears |
| FG-3g: Jump to latest button works | Clicking the button (or scrolling back to the bottom) resumes auto-scroll and hides the button |
| FG-3h: Rolling stats bar | A bar above the feed shows last-60-second buy volume, sell volume, trade count, and average trade size; updates every 1 second |

### FG-4 — WebSocket Management

| Sub-goal | Success Criterion |
|----------|-------------------|
| FG-4a: Single connection | Only one WebSocket connection exists at any time (verifiable in DevTools → Network) |
| FG-4b: Subscription multiplexing | All 8 active channels (6 tickers + 1 orderbook + 1 trades) are carried over that single connection |
| FG-4c: Focus switch re-subscribes correctly | Switching product unsubscribes old orderbook + trades channels and subscribes new ones |
| FG-4d: Automatic reconnection | If the connection drops, the app reconnects automatically without a page refresh |
| FG-4e: Subscriptions restored on reconnect | After reconnect, all previously active channels are re-subscribed without user action |
| FG-4f: Connection status indicator | A visible badge shows "Connected", "Reconnecting", or "Disconnected" at all times |

---

## Non-Functional Goals

These describe **how well the system performs** — constraints on quality, behaviour under
load, and engineering standards that are not directly visible features.

### NFG-1 — Render Isolation

| ID | Requirement | Verification Method |
|----|-------------|---------------------|
| NFG-1a | A ticker update for BTCUSD must not cause ETHUSD's ticker cell to re-render | React DevTools Profiler: ETHUSD render count unchanged after BTCUSD message |
| NFG-1b | A ticker update must not cause the OrderBook or TradesFeed panels to re-render | Profiler: no render recorded in those panels during ticker-only flush |
| NFG-1c | An orderbook update must not cause the TradesFeed panel to re-render | Profiler: TradesFeed render count unchanged during orderbook-only flush |

### NFG-2 — Performance Under Stress

| ID | Requirement | Threshold | Verification |
|----|-------------|-----------|--------------|
| NFG-2a | Main-thread frame rate | ≥ 50 FPS | Chrome Performance trace during stress run |
| NFG-2b | Per-flush processing time (aggregation + store write) | ≤ 10 ms | `performance.now()` marks in pipeline code |
| NFG-2c | UI responsiveness during peak load | Clicks and interactions respond within 100 ms | Manual UX test while backend is at max rate |
| NFG-2d | Graceful degradation at extreme rates (1–5 ms trades) | No freeze, no crash; app may skip renders but must not block the event loop | Stress test + heap snapshot |

### NFG-3 — Memory Stability

| ID | Requirement | Threshold | Verification |
|----|-------------|-----------|--------------|
| NFG-3a | Heap size over a 5-minute stress run | 0 MB net growth (flat profile) | Chrome Memory → Heap Snapshot comparison |
| NFG-3b | Trade feed array size | Capped at MAX_TRADES = 500 entries | Unit test T2-17; heap snapshot |
| NFG-3c | Rolling stats deque | Evicts trades older than 60 seconds on every flush | Unit test T2-18; no unbounded growth |
| NFG-3d | No zombie listeners | Every subscription, interval, and event listener is cleaned up on unmount or symbol switch | Component unmount test; memory DevTools |

### NFG-4 — Reliability & Resilience

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFG-4a | Reconnect delay schedule | Exponential: 1 s → 2 s → 4 s → 8 s → 16 s → 30 s (capped) |
| NFG-4b | Silent-drop detection | Ping/pong heartbeat; forcibly close if no pong within 5 s of ping |
| NFG-4c | Background-tab recovery | On `visibilitychange` (tab re-focused), flush buffer and request fresh snapshot; no large freeze |
| NFG-4d | Focus-switch race safety | Late-arriving messages from the previous symbol are discarded; no stale flicker |

### NFG-5 — Code Quality & Maintainability

| ID | Requirement |
|----|-------------|
| NFG-5a | TypeScript strict mode — no `any` except where a third-party type is genuinely absent |
| NFG-5b | Test coverage ≥ 80% overall; ≥ 95% for pipeline pure functions |
| NFG-5c | ESLint passes with zero warnings on CI |
| NFG-5d | Meaningful git history — each commit advances one logical unit of work |
| NFG-5e | Architecture document committed alongside the code |

### NFG-6 — Backend Protocol Compliance

These are facts from the backend source. Getting them wrong produces blank panels or wrong numbers.

| ID | Requirement |
|----|-------------|
| NFG-6a | Orderbook levels are `[price, size]` tuples — destructure, never access `.price`/`.size` on array |
| NFG-6b | All timestamps (trades + orderbook) are in **microseconds** — divide by 1000 before any ms arithmetic |
| NFG-6c | Trade side derived from `buyer_role`/`seller_role` — no `side` field exists in the message |
| NFG-6d | Ticker `ltp_change_24h` is a multiplier (1.0050 = +0.50%) — convert with `(v - 1) * 100` |
| NFG-6e | Ticker last price comes from `close` field |
| NFG-6f | SOLUSD precision = 4dp, DOGEUSD precision = 6dp (match backend `config.js` exactly) |

### NFG-7 — Correctness of Financial Arithmetic

| ID | Requirement |
|----|-------------|
| NFG-7a | Order book grouping uses integer-scaled arithmetic (floor for bids, ceil for asks) — no floating-point rounding errors |
| NFG-7b | Grouped bid price is always strictly less than grouped ask price (spread can never be zero or negative after grouping) |
| NFG-7c | Cumulative sizes are exact prefix sums — no approximation |
| NFG-7d | Basis-point calculation uses the mid-price as the denominator, not the bid or ask price alone |

---

## Out of Scope

- Placing or simulating orders
- Charting / candlestick visualization
- Authentication or multi-user support
- Mobile / React Native build (Web only)
- Backend changes

---

## Evaluation Weight Map

```
Architecture & State Isolation   30%  →  NFG-1, FG-4, NFG-4
Performance Under Stress         30%  →  NFG-2, NFG-3
Order Book Depth                 20%  →  FG-2, NFG-6
Problem Decomposition            20%  →  NFG-5, commit history, arch doc
```

---

## Definition of Done

1. `npm install && npm run dev` starts the dashboard against the reference backend.
2. React DevTools Profiler confirms zero cross-panel render leakage (NFG-1).
3. Chrome Memory Timeline shows a flat heap over a 5-minute stress run (NFG-3a).
4. All automated tests pass with ≥ 80% coverage (`npm test`).
5. Architecture document (`docs/03-ARCHITECTURE.md`) is committed.
6. Known issues are honestly documented (`docs/KNOWN-ISSUES.md`).

---

## Constraints

- **TypeScript strict mode is mandatory.** No `any` except where unavoidable with third-party types.
- **No single-commit history.** Each phase of work must be its own commit or small series.
- **Architecture doc is required.** Missing it = incomplete submission per the brief.
- The backend stress-test API will be cranked to extreme rates during evaluation; the app must degrade gracefully, not freeze or crash.
