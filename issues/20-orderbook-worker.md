# Issue 20 — Web Worker: All Pipelines Off Main Thread

**Type:** AFK
**Blocked by:** Issue 06 (pipelines must exist and be pure), Issue 11 (store)
**Priority:** Production optimization — not required for assignment evaluation

---

## Problem

At stress rates (backend cranked to `l2_orderbook: {min:10, max:20}`), the backend pushes
**50–100 orderbook snapshots/second**, each carrying 500 bid + 500 ask levels (~30–50KB JSON).
Trades arrive at **200–1000/s**.

Profiling breakdown at extreme rates:
- `JSON.parse` of 50KB orderbook ≈ 2–3ms per message → **200–300ms/s** on main thread
- Orderbook aggregation per 50ms flush → ~2ms per flush → **40ms/s**
- Trade JSON.parse at 1000/s → ~50ms/s on main thread
- Total: ~300ms/s+ competing with React layout and paint

The buffer-flush pattern (Issues 06–10) already decouples message rate from render rate.
This issue addresses the CPU cost during each flush — not the render count.

## What to build

Move **all four aggregation pipelines** to a single Worker. The WebSocket stays on the
main thread (low CPU cost, owns reconnect + subscription registry). The main thread
becomes a dumb router: buffer raw strings → postMessage → receive results → store.set.

### Architecture

```
Main thread
  WS.onmessage
    → push raw message string to buffer  // near zero CPU

  [flush timers fire — every 50/100/200ms]
    → collect buffered raw strings
    → worker.postMessage({ rawOrderBook, rawTrades, rawTickers, increment, symbol, seqId })

Worker thread (src/workers/pipelineWorker.ts)
  self.onmessage = ({ data }) => {
    const parsed = JSON.parse each raw string
    const orderBook = aggregateOrderBook(...)
    const { trades, rollingStats } = aggregateTrades(...)
    const tickers = mergeLatestTickers(...)
    self.postMessage({ orderBook, trades, rollingStats, tickers, seqId: data.seqId })
  }

Main thread
  worker.onmessage = ({ data }) => {
    if (data.seqId !== store.getState().focusSeqId) return  // stale guard
    store.setOrderBook(data.orderBook)
    store.setTrades(data.trades, data.rollingStats)
    store.updateTickers(data.tickers)
  }
```

### Why all four pipelines (not just orderbook)

Option B (OB only) vs Option C (all pipelines) requires the same Worker bridge complexity —
same `postMessage`, same stale guard, same Worker lifecycle. Option C just adds more function
calls inside the Worker's `onmessage` handler. The benefit is much larger:

| | Main thread/second |
|---|---|
| Status quo (no Worker) | ~350ms |
| Worker for OB only | ~100ms |
| Worker for all pipelines | ~10ms |

See `docs/07-WORKER-TRADEOFF.md` for full analysis.

### Wire format (Main → Worker, every flush cycle)

```typescript
interface WorkerInput {
  seqId: number                  // focusSeqId at dispatch time
  symbol: Symbol
  increment: number
  rawOrderBook: string | null    // latest raw JSON string from WS buffer
  rawTrades: string[]            // all raw trade strings from last 100ms
  rawTickers: string[]           // all raw ticker strings from last 200ms
}
```

### Wire format (Worker → Main, per flush)

```typescript
interface WorkerOutput {
  seqId: number
  orderBook: ProcessedOrderBook | null
  trades: AggregatedTrade[]
  rollingStats: RollingStats | null
  tickers: Partial<Record<Symbol, ParsedTicker>>
}
```

Transferring raw strings (cheap — strings are transferable by reference or near-zero copy).
Receiving a compact result (~20 grouped OB levels, 5 trade rows, 6 ticker objects) — tiny.

### Files to create/modify

**`src/workers/pipelineWorker.ts`** — new file
```typescript
import { parseOrderBookMessage, parseTradeMessage, parseTickerMessage } from '@pipelines/parsers'
import { aggregateOrderBook } from '@pipelines/orderBookPipeline'
import { aggregateTrades } from '@pipelines/tradePipeline'
import { updateRollingDeque, computeRollingStats } from '@pipelines/rollingStatsPipeline'
import { mergeLatestTickers } from '@pipelines/tickerPipeline'

let rollingDeque: ReturnType<typeof updateRollingDeque> = []

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { seqId, symbol, increment, rawOrderBook, rawTrades, rawTickers } = e.data

  const orderBook = rawOrderBook
    ? aggregateOrderBook(
        ...parseOrderBookMessage(JSON.parse(rawOrderBook)).bids,
        increment, symbol
      )
    : null

  const parsedTrades = rawTrades.map(r => parseTradeMessage(JSON.parse(r)))
  rollingDeque = updateRollingDeque(rollingDeque, parsedTrades, Date.now())
  const { trades, rollingStats } = aggregateTrades(parsedTrades)

  const parsedTickers = rawTickers.map(r => parseTickerMessage(JSON.parse(r)))
  const tickers = mergeLatestTickers(parsedTickers)

  self.postMessage({ seqId, orderBook, trades, rollingStats, tickers })
}
```

**`src/hooks/usePipelineFlush.ts`** — replaces the three separate flush hooks
- Creates one Worker instance on mount
- Three flush intervals (50ms OB, 100ms trades, 200ms tickers) still exist but only
  batch raw strings and call `worker.postMessage`
- Worker result handler does the single `store.set` call
- Captures `focusSeqId` on dispatch; Worker echoes it back; stale guard on receipt

**`vite.config.ts`** — no change needed
Vite handles Worker imports via `new URL('../workers/pipelineWorker.ts', import.meta.url)` natively.

## Acceptance criteria

- [ ] All pipeline computation runs in Worker thread (verified via Chrome DevTools Performance → flame chart)
- [ ] Main thread shows no `aggregateOrderBook`, `aggregateTrades`, `JSON.parse` (large payloads) in flame chart
- [ ] `stale-snapshot guard` works: Worker results after symbol switch are discarded
- [ ] Worker survives symbol switch without being recreated (single instance per app lifetime)
- [ ] `npm run build` passes — Vite bundles worker correctly
- [ ] All existing pipeline tests pass unchanged (pure functions, no Worker dependency)
- [ ] React render times for all panels unchanged or improved under stress

## Performance target

| Metric | Before | After |
|--------|--------|-------|
| Main thread used/second | ~350ms | <10ms |
| React frame budget | ~500ms | ~840ms |
| Worker thread | — | ~300ms (doesn't block main) |

## Testing scope

- Existing pipeline tests unchanged — pipelines are pure, no Worker dependency
- New integration test: verify Worker receives correct input shape and returns correct output
- Manual: Chrome DevTools Performance trace under stress — confirm main thread clean

## Why not implemented now

The buffer-flush architecture already ensures React sees at most 20 renders/second. Under
the assignment's evaluation conditions this is sufficient for a responsive UI.

Measure with `performance.now()` marks inside flush handlers before optimizing.

## Reference

- Full analysis: `docs/06-OPTIMIZATION-PLAN.md`
- Tradeoff comparison: `docs/07-WORKER-TRADEOFF.md`
- Architecture decision: `docs/04-ARCHITECTURE.md §13`
- Pure pipelines (no changes needed): `src/pipelines/`
