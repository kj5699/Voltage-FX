# Real-Time Crypto Derivatives Trading Dashboard

A high-performance React + TypeScript trading dashboard built for the Delta Exchange take-home assignment. Driven by a single multiplexed WebSocket connection to a stress-test backend that pushes market data at intentionally aggressive rates.

---

## Quick Start

```bash
# 1. Start the backend (requires bun or docker)
git clone https://github.com/saxenanickk/socket-custom-load
cd socket-custom-load && bun install && bun start

# 2. Start the dashboard
cd delta-exchange-assignment
npm install && npm run dev

# 3. Open http://localhost:5173
```

Backend runs on `ws://localhost:8080` (WebSocket) and `http://localhost:3000` (runtime config API).

---

## How I Approached This

Before writing a line of code I spent time decomposing the problem properly. The sequence:

**1. Requirements decomposition first.**
Separated functional goals (what the system does) from non-functional goals (how well it performs under stress). Defined measurable success criteria for each — not "it should be fast" but "≥50 FPS during stress run, verified with Chrome Performance trace."

**2. Surveyed approaches before committing.**
For each hard engineering problem — state management, update throttling, order book grouping, trade list rendering, WebSocket lifecycle — I listed every viable approach, scored tradeoffs, and picked one with explicit reasoning. This is documented in `docs/03-APPROACHES.md`. The goal was to make the architecture defensible, not just functional.

**3. Verified every assumption against the actual backend source.**
This was the most important step. Reading the backend source directly (`generators/`, `config.js`) revealed four issues that would have caused silent failures in the finished UI:

| Issue | What would have broken |
|-------|----------------------|
| Orderbook levels are `[price, size]` tuples, not objects | Entire order book panel blank — `.price` on an array is `undefined` |
| Timestamps are microseconds, not milliseconds | 100ms trade aggregation would never merge any trades |
| No `side` field on trades — derived from `buyer_role`/`seller_role` | All trade colour-coding (green/red) missing |
| `ltp_change_24h` is a multiplier (1.0234), not a percentage | 24h change displayed as ~100× the real value |

Additionally, two symbol precisions were wrong in the initial plan: SOLUSD is 4dp (not 2dp) and DOGEUSD is 6dp (not 4dp). Both affect grouping bucket boundaries.

**4. Distinguished breaking issues from nice-to-haves.**
Not all gaps are equal. A crossed-book edge case is irrelevant when the backend never generates one. A malformed JSON handler is good practice when the backend is clean generated data. I only added to the plan what would actually break the app.

**5. Wrote tests before implementation.**
The TDD plan (`docs/05-TDD-PLAN.md`) defines 68 test scenarios across 7 phases — from pure pipeline functions through to E2E Playwright tests. Protocol compliance tests run first and act as a gate for everything downstream: if the tuple destructuring test fails, no pipeline test is meaningful.

---

## What I Used Claude For

Claude was used as a research and drafting tool throughout this process — generating the initial documentation drafts, surveying architectural options, and producing code scaffolding.

What Claude did not do:

- **Read the backend source unprompted.** I directed it to fetch and analyse `generators/l2_orderbook.js`, `generators/all_trades.js`, `generators/ticker.js`, and `config.js`. The four breaking bugs above were found as a result of that investigation.
- **Decide what matters.** When I ran a gap analysis, Claude surfaced 20+ potential issues. I triaged them — "breaks the app" vs "good to have" — and only the former went into the plan.
- **Make architectural calls.** Zustand over Redux, buffer-flush over Web Workers, integer-scaled grouping over `decimal.js` — I evaluated each with explicit tradeoffs before deciding.

The architecture document, the protocol contract table, the precision corrections, and the focus-switch sequence — these reflect engineering judgment applied to what the AI produced, not the AI's output verbatim.

---

## Read the Docs in This Order

| # | Document | What it covers |
|---|----------|---------------|
| 1 | [docs/01-PRD.md](docs/01-PRD.md) | Problem statement, solution, 42 user stories, implementation decisions, test seams |
| 2 | [docs/02-GOALS.md](docs/02-GOALS.md) | Functional goals, non-functional goals (with measurable thresholds), definition of done |
| 3 | [docs/03-APPROACHES.md](docs/03-APPROACHES.md) | Every approach considered per problem area, tradeoffs, final choices |
| 4 | [docs/04-ARCHITECTURE.md](docs/04-ARCHITECTURE.md) | System design, data flow, backend protocol contract, aggregation pipelines, performance budget |
| 5 | [docs/05-TDD-PLAN.md](docs/05-TDD-PLAN.md) | 68 test scenarios across 7 phases, coverage targets, commit cadence |

---

## Architecture in One Paragraph

A singleton `WebSocketManager` (outside React) owns the single connection, subscription registry, reconnect backoff, and heartbeat. Incoming frames push into `useRef` buffers — no renders triggered. Interval-based flush handlers (50ms orderbook, 100ms trades, 200ms tickers) drain the buffers, run pure transformation pipelines, and write one batched update to a Zustand store. Components subscribe to atomic selectors — each reads exactly its own slice. Zustand's `Object.is` check ensures a BTCUSD ticker update cannot re-render the ETHUSD cell or either panel below. The trade feed renders via `react-window` (≈15 DOM nodes regardless of feed length). The entire pipeline — ingestion through render — stays under 13ms per 50ms frame at default backend rates.

```
Backend (ws://8080)
    │ raw frames (tuples, μs timestamps, role fields)
    ▼
WebSocketManager → useRef buffers (zero renders)
    │ flush every 50/100/200ms
    ▼
Pure pipelines (parse → group → aggregate → metrics)
    │ one setState per flush
    ▼
Zustand store (atomic slices)
    │ selector per component
    ▼
TickerCell[×6]  │  OrderBookPanel  │  TradesFeedPanel
  (isolated)         (isolated)          (isolated)
```

---

## Project Structure

```
src/
├── ws/              WebSocketManager singleton + message types
├── store/           Zustand store + typed selectors
├── pipelines/       Pure functions: orderBook, trades, ticker
├── hooks/           Buffer flush hooks: useOrderBook, useTrades, useTickerBar
├── components/
│   ├── TickerBar/
│   ├── OrderBook/
│   └── TradesFeed/
├── config/          SYMBOL_CONFIG (precision + grouping increments per symbol)
└── utils/           Precision scaling, timestamp helpers, time formatting
```

---

## Running Tests

```bash
npm test              # Vitest unit + integration tests
npm run test:e2e      # Playwright E2E (requires backend running)
npm run coverage      # Coverage report (target: ≥80% overall, ≥95% pipelines)
```

---

## Known Limitations

- **Background tab freeze:** When the tab is hidden, browsers throttle timers. On re-focus, the accumulated buffer flushes at once and may cause a brief lag. Mitigation (clear buffer + request fresh snapshot on `visibilitychange`) is documented but not implemented.
- **Rolling stats accuracy at extreme load:** The 60-second rolling stats are computed client-side from a deque. At 200+ trades/second the deque grows large before eviction runs. Values remain correct but GC pressure increases.
- **Grouping spread accuracy at large increments:** At very coarse grouping (e.g. BTCUSD at 500), the displayed spread reflects aggregated bucket boundaries, not the real top-of-book spread. A visual indicator noting this is planned but not implemented.

---

## Tech Stack

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | React 18 + TypeScript (strict) | Assignment requirement |
| Build | Vite | Fast HMR, native ESM |
| State | Zustand | Atomic selectors, zero React tree involvement, minimal boilerplate |
| Styling | Tailwind CSS | Utility-first, no runtime overhead |
| List rendering | react-window | Constant DOM node count regardless of feed length |
| Testing | Vitest + RTL + MSW + Playwright | Fast unit tests, real DOM behaviour tests, WS mock, E2E |
