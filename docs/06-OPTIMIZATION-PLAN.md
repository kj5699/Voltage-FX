# 06 — Optimization Plan: High-Frequency Load Analysis & Web Worker Strategy

## Why This Document Exists

The assignment backend can be cranked to **1–5ms trade intervals and 10–20ms orderbook intervals** via the runtime config API. At those rates:

- Trades arrive at **200–1000/s**
- Orderbook snapshots arrive at **50–100/s**, each carrying 500 bid + 500 ask levels (~30–50KB JSON)

The buffer-flush pattern (Issues 06–10) already decouples message rate from render rate. React only sees 5–20 `setState` calls/second regardless of how fast messages arrive. That problem is solved.

What is **not** solved by buffering: the CPU cost of `JSON.parse` and aggregation pipeline math lands on the **main thread** during every flush cycle, competing directly with React layout and paint.

This document analyses what breaks first, at what rate, and the mitigation strategy.

---

## Bottleneck Analysis

### Main thread budget per second

| Budget | Available |
|--------|-----------|
| Total | 1000ms |
| React render + layout + paint | ~100–150ms |
| Remaining for data work | ~850ms |

### What actually runs on the main thread

#### Trade messages (1–5ms interval = 200–1000/s)

| Operation | Cost/msg | Cost/s at 1000/s |
|-----------|----------|-----------------|
| `JSON.parse` ~200 bytes | ~0.05ms | **50ms** |
| Push to buffer | ~0.001ms | ~1ms |
| Aggregation (per 100ms flush) | ~0.5ms total | **5ms** |

**Verdict:** trades are fine on the main thread. Small payloads, trivial parse, aggregation runs 10×/s not 1000×/s.

#### Orderbook snapshots (10–20ms interval = 50–100/s)

| Operation | Cost/msg | Cost/s at 100/s |
|-----------|----------|----------------|
| `JSON.parse` ~50KB (500+500 levels) | ~2–3ms | **200–300ms** |
| Aggregation per 50ms flush (sort, prefix-sum, depth-bars) | ~1–2ms total | **20–40ms** |

**Verdict: this is the real problem.** At extreme rates, orderbook JSON.parse alone consumes 20–30% of the main thread. Combined with React renders, the UI begins to jank.

---

## What Breaks First (in order)

1. **Orderbook JSON.parse** at >50 snapshots/s — first thing to feel laggy
2. **Orderbook aggregation pipeline** during 50ms flush — sort + prefix-sum on 500+ groups
3. **Trade JSON.parse** at >500/s — noticeable but not severe (payloads are tiny)
4. **React reconcile** for OrderBookPanel — at 20 renders/s with a 50+ row table

---

## Optimization Strategy

### Level 1: Current (already implemented)

- **Buffer-flush pattern** — decouples message rate from render rate
- **Atomic Zustand selectors** — zero cross-panel re-renders
- **Integer-scaled grouping** — no float rounding, no `toFixed` in hot path
- **react-window** — constant ~15 DOM nodes for trades regardless of volume

These handle the render problem completely. The main thread CPU problem remains.

---

### Level 2: Targeted Web Worker for Orderbook Aggregation

**Only the orderbook aggregation pipeline moves to a Worker. The WebSocket stays on the main thread.**

This is the highest-leverage change: orderbook parse + aggregate is the single most expensive operation, and it's pure computation with no DOM or store access.

#### Wire format

```
Main thread                          Worker thread
──────────                           ──────────────
WS.onmessage                         
  → JSON.parse(raw)           →→→→→  postMessage(ParsedOrderBook)
                                        aggregateOrderBook()
                                        (sort, prefix-sum, depth bars)
                               ←←←←  postMessage(ProcessedOrderBook)
  store.setOrderBook(result)
  React renders OrderBookPanel
```

#### Why NOT move JSON.parse to the Worker too?

You'd need to `postMessage` the raw string (cheap — strings are transferred by reference via Transferable), parse in the Worker, then `postMessage` the result back. Possible, but the parsed object (500 levels × 2 sides) costs ~0.5ms to structured-clone back. The processed result (20–50 grouped levels) costs ~0.05ms. **Always pay the clone cost on the smaller object.**

#### Why NOT move the WebSocket to the Worker?

- WebSocket in Workers is valid (Workers support it)
- But every incoming message would then `postMessage` to main — that's 200–1000 small round-trips/s just for trades, adding latency and overhead for no benefit (trades are already cheap to parse on main)
- The subscription registry and reconnect logic are easier to debug on the main thread

#### Implementation sketch

```typescript
// src/workers/orderBookWorker.ts
self.onmessage = (e: MessageEvent<ParsedOrderBook>) => {
  const { bids, asks, increment, symbol } = e.data
  const result = aggregateOrderBook(bids, asks, increment, symbol)
  self.postMessage(result)
}

// In the orderbook flush handler (main thread):
const worker = new Worker(new URL('../workers/orderBookWorker.ts', import.meta.url))
worker.postMessage({ bids, asks, increment, symbol })
worker.onmessage = (e: MessageEvent<ProcessedOrderBook>) => {
  if (capturedSeqId !== store.focusSeqId) return  // stale guard still applies
  store.setOrderBook(e.data)
}
```

Vite supports Worker imports via `new URL(..., import.meta.url)` natively — no extra config.

---

### Level 3: SharedArrayBuffer for Zero-Copy Buffer (future)

For extreme production load (50 symbols × full orderbook), structured-clone costs compound. The alternative is a shared memory ring buffer:

```
Main thread writes raw bytes → SharedArrayBuffer
Worker reads + parses → processes → writes result to another SharedArrayBuffer
Main thread reads result
```

Requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers. Not feasible for this assignment but the right direction for a real trading terminal.

---

## What Stays On the Main Thread (Forever)

| Component | Reason |
|-----------|--------|
| WebSocketManager | Owns reconnect, heartbeat, subscription registry — needs to coordinate with store |
| Trade parse + aggregate | Payloads are tiny, not worth Worker overhead |
| Ticker parse + merge | Same — tiny, 200ms flush, negligible |
| Zustand store writes | DOM API — Workers have no access |
| React render | DOM API — Workers have no access |

---

## Measurement Plan

Before implementing Level 2, measure to confirm the bottleneck:

```javascript
// In the orderbook flush handler:
const t0 = performance.now()
const result = aggregateOrderBook(bids, asks, increment, symbol)
const elapsed = performance.now() - t0
if (elapsed > 1) console.warn('orderbook aggregation', elapsed.toFixed(2), 'ms')
```

Chrome DevTools → Performance tab → stress test for 10s → look for:
- Long tasks > 50ms on main thread
- `JSON.parse` in the flame chart consuming > 5ms/frame
- React render blocked by data work

If the flame chart shows `JSON.parse` > 2ms per orderbook message at stress rates, Level 2 is justified. If everything stays under 1ms, skip the Worker complexity.

---

## Tradeoffs Summary

| Approach | Main thread relief | Complexity added | When to use |
|----------|-------------------|-----------------|-------------|
| Buffer-flush (current) | Render isolation ✅ | Low | Always |
| Worker for OB aggregation | Parse + sort off main ✅ | Medium | >50 OB snapshots/s |
| WS in Worker | Marginal for trades ❌ | High | Not recommended |
| SharedArrayBuffer | Zero-copy ✅ | Very high | 50+ symbols production |

---

## Scaling Question (from assignment)

> "If we needed 50 symbols with full orderbook + trades for each, what breaks first?"

**Answer:** The orderbook JSON.parse × 50 symbols. Even at the default rate (25 snapshots/s per symbol × 50 symbols = 1250 snapshots/s × 2.5ms each = 3125ms/s of parse work). The main thread would be fully blocked.

**Redesign required:**
1. One Worker per symbol group (e.g. 10 Workers × 5 symbols each) — true parallelism
2. Only subscribe to visible symbols' orderbooks — paginated/tabbed UI
3. Server-side aggregation — push pre-grouped levels, not raw 500-level snapshots
4. Binary protocol (FlatBuffers/protobuf) instead of JSON — 5–10× parse speed improvement
