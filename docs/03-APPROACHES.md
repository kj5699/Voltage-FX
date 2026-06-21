# Approaches Document — Real-Time Trading Dashboard

This document surveys every viable architectural approach for each of the three hard
engineering problems in this assignment, scores them, and declares a final choice.

---

## Problem 1 — State Management & Render Isolation

The central challenge: 8 concurrent WebSocket streams at wildly different frequencies must
update 3 visually isolated panels without leaking renders across panel boundaries.

---

### Approach 1-A: Plain React Context + useState

All WebSocket data lands in a top-level React Context. Components consume it via
`useContext`.

**How it works:** A single `<DataProvider>` holds ticker map, orderbook, and trades in
`useState`. The WS message handler calls the appropriate setter. Every context consumer
re-renders on every setter call.

**Pros:**
- Zero extra dependencies
- Trivially understood by any React developer
- No boilerplate

**Cons:**
- Any ticker update re-renders the OrderBook and Trades panels — catastrophic at 30 msg/s
- Cannot scope subscriptions to a slice; `useContext` gives you the whole value
- At 200 msg/s the app will drop frames and freeze

**Verdict:** Disqualified. Fails the core render-isolation requirement immediately.

---

### Approach 1-B: React Context with manual memo boundaries

Split contexts (TickerContext, OrderBookContext, TradesContext). Wrap each panel in
`React.memo`. Use `useMemo` to stabilise selector outputs.

**How it works:** Three separate contexts, each with their own Provider. Memo wrapping at
the panel boundary prevents the panel from re-rendering unless its specific context value
changes.

**Pros:**
- No external dependencies
- Better isolation than 1-A

**Cons:**
- Context value is an object reference; any inner update (e.g. one ticker out of 6) creates
  a new object, busting all 6 `TickerCell` memo boundaries unless you split contexts even
  further (one context per symbol)
- Managing 6 + 1 + 1 = 8 individual React Contexts is brittle boilerplate
- Still runs on the main thread synchronously on every message

**Verdict:** Workable but fragile. Fails the "BTCUSD update must not re-render ETHUSD"
requirement without per-symbol context splitting.

---

### Approach 1-C: Zustand with atomic selectors ✅ CHOSEN

An external, non-React store (Zustand) holds all server state. Components subscribe to
fine-grained selector functions. Zustand compares the selector output with `Object.is`
before scheduling a re-render.

**How it works:**
```
store slices:
  tickers: Record<symbol, TickerData>       ← updated by v2/ticker
  orderBook: { bids, asks, metrics }         ← updated by l2_orderbook
  trades: Trade[]                            ← updated by all_trades
  focusedSymbol: string
  wsStatus: 'connected'|'reconnecting'|...

TickerCell subscribes to: state => state.tickers[symbol]          // per-symbol data
                          state => state.focusedSymbol === symbol  // boolean for focus ring
OrderBook subscribes to:   state => state.orderBook
TradesFeed subscribes to:  state => state.trades
```

Because each `TickerCell` selects only its own symbol's slice, a BTCUSD update produces a
new object only for `tickers['BTCUSD']`. The ETHUSD selector output is unchanged →
no re-render for ETHUSD.

The focus-state selector (`useIsSymbolFocused`) returns a **boolean** rather than the full
`focusedSymbol` string. This means a symbol switch only re-renders the two cells whose
boolean changed (old focused → false, new focused → true) — not all six.

**Profiler-verified:** React DevTools Profiler confirms that during an order book flush,
`TickerBar` and all `TickerCell` components show the hatched "did not render" pattern.
During a ticker flush for one symbol, only that cell's bar is yellow; the other five, the
order book panel, and the trades panel all remain hatched.

**Pros:**
- Provably zero cross-panel render leakage (selector equality check is O(1))
- Minimal boilerplate; `create()` is 10 lines
- Devtools integration available
- No React tree involvement for state reads/writes
- Easy to add derived selectors without prop drilling

**Cons:**
- One extra dependency (Zustand ~1 kB)
- Developers unfamiliar with external stores need a brief orientation

**Verdict:** Best fit. Chosen as the state management solution.

---

### Approach 1-D: Redux Toolkit with RTK-Query

Full Redux setup with slices, reducers, and selectors.

**Pros:** Battle-tested at scale, excellent DevTools, strong TypeScript support.

**Cons:** 5-10× more boilerplate than Zustand for this scope. RTK-Query is designed for
HTTP, not WebSocket. Overkill for a 3-panel dashboard. Adds ~20 kB to the bundle.

**Verdict:** Over-engineered for this scope. Rejected.

---

### Approach 1-E: Jotai (atomic state)

Each ticker price is an individual atom. Components subscribe to specific atoms.

**Pros:** Granular, zero wasted re-renders by design.

**Cons:** 8 concurrent WebSocket streams each updating atoms independently creates
coordination complexity. No single "flush all" primitive for batched updates.

**Verdict:** Viable but less ergonomic than Zustand for this domain. Rejected.

---

## Problem 2 — High-Frequency Update Throttling

Trades arrive every 1–5 ms under stress. Pushing every trade directly to the store causes
200+ Zustand updates per second, each potentially scheduling a React render.

---

### Approach 2-A: Direct store write on every message

Write to Zustand immediately on every WebSocket message.

**Pros:** Simplest code path.

**Cons:** At 200 msg/s, React scheduler is flooded with render requests. Even with batching
improvements in React 18, the reconciler cannot drain the queue fast enough and the main
thread starves.

**Verdict:** Fails under stress. Rejected.

---

### Approach 2-B: React 18 `startTransition` + `useDeferredValue`

Mark all store-driven renders as low-priority transitions. React will yield to user
interactions before processing them.

**Pros:** Built-in; no extra packages.

**Cons:** Does not reduce the number of renders, only their priority. At 200 Hz the render
queue still grows without bound. Also doesn't help with JS-side computation cost.

**Verdict:** Useful as a complement but insufficient on its own. Rejected as primary.

---

### Approach 2-C: `useRef` accumulation buffer + `setInterval` flush ✅ CHOSEN

Raw WebSocket messages are pushed into a `useRef` array (not React state — no render
triggered). A `setInterval` running at a fixed rate (100 ms for trades, 50 ms for
orderbook) drains the buffer and writes one batched update to Zustand.

**How it works:**
```
WebSocket message → push to wsBuffer.current (zero renders)
setInterval(100ms) → drain buffer → compute aggregations → zustand.setState (1 render)
```

This caps renders at 10/s for trades regardless of the incoming message rate.

**Pros:**
- Simple to implement and reason about
- Decouples ingestion rate from render rate
- Buffer naturally handles bursts; no messages are dropped
- Works with any state management library

**Cons:**
- Introduces up to `flushInterval` ms of display lag (100 ms is imperceptible for trades)
- `setInterval` jitter (±4 ms in modern browsers) is acceptable for this use case
- Buffer can grow large if tab is backgrounded (mitigated by `visibilitychange` handler)

**Verdict:** Optimal balance of simplicity and correctness. Chosen.

---

### Approach 2-D: Web Worker offload ✅ ALSO IMPLEMENTED

Parse and aggregate all WebSocket data in a background Worker thread. Post processed
results to the main thread.

**How it works (implemented in `src/workers/pipelineWorker.ts`):**
```
Main thread flush tick:
  orderBookBuffer → worker.postMessage({ type:'ob', raw, increment, symbol, seqId })
  tradesBuffer    → worker.postMessage({ type:'trades', raws[], notionalThreshold, nowMs, seqId })
  tickerBuffer    → worker.postMessage({ type:'tickers', raws[] })

Worker thread (pipelineWorker.ts):
  JSON.parse(raw) → parseMessage() → aggregate*() → postMessage(processedResult)

Main thread onmessage:
  store.setState(processedResult)    ← only store write + React render touch main thread
```

Raw JSON **strings** are sent to the Worker (cheap to clone). The Worker returns compact,
already-aggregated objects (10–25× smaller than the input). Clone cost is paid on the
output, not the input.

**Pros:** Completely offloads JSON.parse + all pipeline CPU from the main thread. Necessary
at 50-symbol scale. Main-thread frame budget drops from ~13 ms to ~6 ms.

**Cons:**
- All data must be serialised (JSON or structured clone) for `postMessage` — adds latency
- Cannot share React/Zustand store references; requires a message-passing protocol

The latency cost is negligible compared to the gain: `postMessage` round-trip for a
~50KB string is < 0.5 ms, while `JSON.parse` of that string alone takes 2–5 ms on the
main thread.

**Verdict:** Implemented. Used for all three pipelines (ob, trades, tickers).

---

## Problem 3 — Order Book Grouping

Group raw price levels into user-selected increments. Must be correct across 6 symbols with
different decimal precisions, fast enough to run every 10–20 ms under stress.

---

### Approach 3-A: Naive loop with `toFixed` rounding

Round prices using `(price).toFixed(N)` and bucket by string key.

**Pros:** Simple to write.

**Cons:** Floating-point `toFixed` produces platform-dependent results. Grouping 62,341.5
by increment 5 with `toFixed` can produce "62340.0" or "62345.0" inconsistently.
Bids and asks can collide at the same grouped price level.

**Verdict:** Incorrect. Rejected.

---

### Approach 3-B: Integer-scaled arithmetic ✅ CHOSEN

Multiply all prices by `10^precision` to work entirely in integers before grouping, then
divide back.

```
precision = 1 (BTCUSD)   → scale = 10
price 62,341.5            → scaled = 623415
increment 5.0             → scaled increment = 50

bid grouped = Math.floor(623415 / 50) * 50 = 623400  → 62,340.0
ask grouped = Math.ceil (623415 / 50) * 50 = 623450  → 62,345.0
```

Bids always floor (round down), asks always ceil (round up) — spread is preserved.

**Pros:**
- Eliminates floating-point rounding errors entirely
- Mathematically provable: bid_grouped < ask_grouped always holds
- Fast: integer division is O(1) per level

**Cons:**
- Requires a per-symbol `precision` lookup table (6 entries — trivial)
- Division by scaled increment then multiplication must be done carefully for very large
  prices (no overflow risk in JS since we use numbers, max safe integer is 2^53)

**Verdict:** Correct and fast. Chosen.

---

### Approach 3-C: `decimal.js` library

Use an arbitrary-precision decimal library for all price arithmetic.

**Pros:** Zero manual precision management.

**Cons:** 30 kB dependency; 10-100× slower than integer arithmetic; overkill when we
control the precision ourselves via the symbol metadata.

**Verdict:** Over-engineered. Rejected.

---

## Problem 4 — Trade List Rendering

Trades arrive every 1–5 ms under stress. Rendering every trade as a DOM node destroys
performance.

---

### Approach 4-A: Uncapped `Array.push` to DOM

Append a `<tr>` for every trade.

**Pros:** None beyond trivial implementation.

**Cons:** After 10 minutes at 200 msg/s there are 120,000 DOM nodes. Browser freezes.
Memory grows unboundedly.

**Verdict:** Disqualified.

---

### Approach 4-B: Capped array + full re-render

Keep a capped array of last N trades (e.g. 500). Replace the whole array on flush.

**Pros:** Memory bounded. Simple.

**Cons:** Renders 500 DOM nodes on every flush (10×/s). At 10 renders/s × 500 rows =
5,000 DOM mutations/s — still heavy.

**Verdict:** Acceptable for low-stress demo but breaks under profiler inspection.

---

### Approach 4-C: Capped array + `react-window` virtualisation ✅ CHOSEN

Keep a capped array (500 trades). Render it through `react-window`'s `FixedSizeList`,
which only mounts DOM nodes for the ~15 visible rows.

**Pros:**
- DOM node count constant at ~15 regardless of array size
- Scroll is buttery because the virtualiser handles it natively
- `react-window` is mature, well-tested (used by Google, Airbnb)

**Cons:**
- Row height must be fixed (or estimated with `VariableSizeList` — not needed here)
- Auto-scroll requires `listRef.scrollToItem()` — slightly more code than `scrollIntoView`

**Verdict:** Best correctness/performance/complexity balance. Chosen.

---

### Approach 4-D: Canvas / WebGL rendering

Draw trade rows directly to a `<canvas>`.

**Pros:** Absolute maximum performance; no DOM overhead.

**Cons:** Loses native accessibility, copy-paste, browser text rendering. Far more code.
Overkill for a 500-row list.

**Verdict:** Documented as the 50-symbol production path. Not implemented.

---

## Problem 5 — WebSocket Lifecycle Management

Single connection, reconnection, subscription tracking, focus-switch transitions.

---

### Approach 5-A: Scattered `useEffect` hooks

Each component opens its own WS or manages subscriptions in individual effects.

**Pros:** Co-located with components.

**Cons:** Multiple connections (violates G1). Race conditions on unmount. No global
reconnect logic.

**Verdict:** Disqualified.

---

### Approach 5-B: Singleton WebSocket service class ✅ CHOSEN

A plain TypeScript class (`WebSocketManager`) instantiated once at app start. Holds the
socket, a subscription registry, a reconnect timer, and a message dispatcher.

Components (or the Zustand store's `init` action) call:
```
wsManager.subscribe(channel, symbol, handler)
wsManager.unsubscribe(channel, symbol)
```

On reconnect, the manager replays all active subscriptions automatically.

**Pros:**
- Single source of truth for connection state
- Reconnect logic lives in one place (exponential backoff, ping/pong heartbeat)
- Focus-switch transitions are atomic: unsubscribe old → clear store slice → subscribe new
- Easy to test in isolation (mock the WebSocket constructor)

**Cons:**
- Global singleton — harder to test if you need multiple concurrent managers
  (not a concern here)

**Verdict:** Correct for this scope. Chosen.

---

## Final Technology Decisions Summary

| Concern | Chosen Approach | Alternative Considered |
|---------|----------------|------------------------|
| State management | Zustand with atomic selectors + `useIsSymbolFocused` boolean hook | Redux Toolkit, Jotai, Context |
| Update throttling | `useRef` buffer + `setInterval` flush + Web Worker for all pipelines | Direct write |
| Order book grouping | Integer-scaled floor/ceil | decimal.js, toFixed strings |
| Trade list rendering | react-window FixedSizeList (~15 DOM nodes always) | Capped array, Canvas |
| WS lifecycle | Singleton `WebSocketManager` class | Scattered useEffect hooks |
| Large-trade threshold | Per-symbol default in `SYMBOL_CONFIG.largeTradeThreshold`, resets on switch | Single global constant |
| RollingStatsBar display rate | `useRef` + 1s `setInterval` (empty deps — no effect restarts) | `useEffect([liveStats])` (restarted every 100ms) |
| OrderBookRow flash refs | Stable callback Map (`rowRefCallbacks`) keyed by price | Inline arrow `ref={}` (new function every render) |
| Styling | Tailwind CSS (utility-first, no runtime) | CSS Modules, styled-components |
| Testing | Vitest + React Testing Library | Jest, Playwright |
| DevTools Profiler | `define: { 'process.env.NODE_ENV': JSON.stringify(mode) }` in vite.config.ts | No change (Profiler silently unavailable) |
