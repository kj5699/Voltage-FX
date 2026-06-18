# Issue 20 — Web Worker: Orderbook Aggregation Pipeline Off Main Thread

**Type:** AFK
**Blocked by:** Issue 06 (orderBookPipeline must exist and be pure), Issue 11 (store)
**Priority:** Production optimization — not required for assignment evaluation

---

## Problem

At stress rates (backend cranked to `l2_orderbook: {min:10, max:20}`), the backend pushes
**50–100 orderbook snapshots/second**, each carrying 500 bid + 500 ask levels (~30–50KB JSON).

Profiling breakdown:
- `JSON.parse` of 50KB ≈ 2–3ms per message
- At 100 snapshots/s → **200–300ms/s** of main thread consumed on parse alone
- Aggregation pipeline (sort + prefix-sum + depth bars) adds ~1–2ms per 50ms flush

The main thread has ~850ms/s available after React's own budget. Orderbook work alone at
extreme rates can consume 25–35% of that, causing visible jank in React renders.

The buffer-flush pattern (50ms flush) already ensures React only reconciles ~20×/s.
This issue addresses the CPU cost during each flush — not the render count.

## What to build

A dedicated `orderBookWorker` that owns the orderbook aggregation pipeline.
The WebSocket and all other pipelines stay on the main thread.

### Architecture

```
Main thread
  WS.onmessage (l2_orderbook)
    → parseOrderBookMessage(raw)           // JSON.parse + type conversion
    → orderBookBuffer.current = parsed     // overwrite — only latest matters
    [50ms flush timer fires]
    → worker.postMessage(ParsedOrderBook)  // send 500-level parsed data

Worker thread (src/workers/orderBookWorker.ts)
  self.onmessage = ({ data }) => {
    const result = aggregateOrderBook(
      data.bids, data.asks, data.increment, data.symbol
    )
    self.postMessage(result)               // send back 20–50 grouped levels
  }

Main thread
  worker.onmessage = ({ data: ProcessedOrderBook }) => {
    if (capturedSeqId !== store.focusSeqId) return  // stale-snapshot guard
    store.setOrderBook(data)
  }
```

### Why this split (not moving WS to Worker)

- Structured clone cost scales with object size
- Input (ParsedOrderBook): 500+500 levels — relatively large
- Output (ProcessedOrderBook): 20–50 grouped levels — 10–25× smaller
- Always pay the clone tax on the smaller object → Worker returns result, not input
- Trade messages (~200 bytes) don't justify Worker overhead — cost exceeds benefit
- WebSocket on main thread keeps reconnect + subscription registry simple

### Files to create/modify

**`src/workers/orderBookWorker.ts`** — new file
```typescript
import { aggregateOrderBook } from '@pipelines/orderBookPipeline'
import type { ParsedOrderBook } from '@pipelines/parsers'
import type { Symbol } from '@config/symbols'

interface WorkerInput {
  bids: ParsedOrderBook['bids']
  asks: ParsedOrderBook['asks']
  increment: number
  symbol: Symbol
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { bids, asks, increment, symbol } = e.data
  const result = aggregateOrderBook(bids, asks, increment, symbol)
  self.postMessage(result)
}
```

**`src/hooks/useOrderBookFlush.ts`** — modify flush handler
- Replace synchronous `aggregateOrderBook()` call with `worker.postMessage()`
- Worker instance created once, reused across flushes
- On symbol change (focusSeqId change): worker stays alive, stale-guard handles discard

**`vite.config.ts`** — no change needed
Vite handles Worker imports via `new URL('../workers/orderBookWorker.ts', import.meta.url)` natively.

## Acceptance criteria

- [ ] `aggregateOrderBook` runs in Worker thread (verified via Chrome DevTools Performance → flame chart shows it off main thread)
- [ ] Main thread shows no `aggregateOrderBook` call in flame chart during orderbook updates
- [ ] `stale-snapshot guard` still applies: Worker results arriving after symbol switch are discarded
- [ ] Worker survives symbol switch without being recreated (single instance, stale guard handles cleanup)
- [ ] `npm run build` passes — Vite bundles worker correctly
- [ ] All existing orderbook pipeline tests still pass (pure function, no Worker dependency)
- [ ] React render time for OrderBookPanel unchanged or improved under stress

## Performance target

| Metric | Before | After |
|--------|--------|-------|
| Main thread during OB flush | ~2–3ms | <0.5ms |
| Worker thread during OB flush | — | ~1–2ms (doesn't block main) |
| React frame budget reclaimed | — | 1.5–2.5ms/flush |

## Testing scope

- Existing `orderBookPipeline.test.ts` tests unchanged (pipeline is pure — no Worker dependency)
- New integration test: verify Worker receives correct input shape and returns ProcessedOrderBook
- Manual: Chrome DevTools Performance trace under stress — confirm main thread clean

## Why not implemented now

The buffer-flush architecture with 50ms flush timer already ensures React sees at most
20 orderbook renders/second. Under the assignment's evaluation conditions this is
sufficient for a responsive UI.

The Worker becomes necessary when:
1. Flush interval cannot be increased further (already at minimum useful value)
2. `JSON.parse` + aggregation demonstrably blocks React frames (measure first)
3. Load exceeds ~50 orderbook snapshots/second sustained

Measure with `performance.now()` marks inside the flush handler before optimizing.
Premature Worker adoption adds real complexity (message bridge, stale-guard complexity,
Worker lifecycle) without guaranteed benefit.

## Reference

- Full analysis: `docs/06-OPTIMIZATION-PLAN.md`
- Architecture decision: `docs/04-ARCHITECTURE.md §13`
- Pure pipeline (no changes needed): `src/pipelines/orderBookPipeline.ts`
