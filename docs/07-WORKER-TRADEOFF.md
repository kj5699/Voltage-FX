# 07 — Web Worker Tradeoff: Where Should the CPU Work Happen?

A plain-English comparison of three architectures for handling high-frequency data.
No jargon. Skip to the verdict at the bottom.

---

## The Problem in One Sentence

At stress rates, the backend pushes **orderbook snapshots every 10ms** and **trades every 1–5ms**.
Parsing and processing that data on the main thread — the same thread React uses to draw the UI
— causes the UI to stutter.

---

## Think of it Like a Kitchen

The **main thread** is the head chef. React is cooking the meal (rendering the UI).

At normal speed: the chef can handle a few orders (WebSocket messages), prep ingredients (parse + aggregate), and plate the food (render) without breaking a sweat.

At stress speed: 200 orders arrive every second. The chef is so busy prepping ingredients that he can't actually cook. The food (UI) gets cold and late.

A **Web Worker** is a sous chef in a separate kitchen. He does all the prep work. The head chef just plates.

---

## Option A — Status Quo (Everything on Main Thread)

```
Main thread: WebSocket → parse → buffer → aggregate OB → aggregate Trades
             → rolling stats → merge tickers → update store → React renders
```

**Problem:** At stress rates, parse + aggregate consumes ~300ms every second on the main thread.
React only gets what's left. Frames drop. UI stutters.

**Good for:** Normal rates. The current implementation. Assignment baseline.

---

## Option B — Move Only Orderbook to a Worker

```
Main thread: WebSocket → parse → buffer → [trades/tickers still here] → update store → React
Worker:      aggregateOB → return result
```

**Previous recommendation.** Saves ~250ms/s by moving the biggest bottleneck (orderbook
aggregation) off main. Trades still run on main (~50ms/s).

**The catch:** You've already paid the cost of building the Worker bridge. Trades on main is
still a problem. And critically — **adding everything else to the same Worker costs almost
nothing extra**.

---

## Option C — Move ALL Pipelines to One Worker ✅ Recommended

```
Main thread: WebSocket → buffer raw strings → postMessage → receive results → update store → React
Worker:      JSON.parse → aggregateOB + aggregateTrades + rollingStats + mergeTickers → return
```

Main thread becomes a **dumb router**. It only buffers raw text strings (near zero CPU) and
writes the finished results to the store. The Worker does everything in between.

**The key insight:** Once you build the Worker bridge for orderbook (Option B), adding trades,
rolling stats, and tickers to the same Worker is just more data in the same `postMessage`.
The complexity is identical. The benefit is much larger.

---

## Side-by-Side at Stress Rates (OB every 10ms, Trades every 1–5ms)

| | A — Status Quo | B — OB Worker | C — All Pipelines |
|---|---|---|---|
| Main thread used/second | ~350ms | ~100ms | ~10ms |
| React budget remaining | ~500ms | ~750ms | ~840ms |
| Workers needed | 0 | 1 | 1 |
| `postMessage` calls per flush | 0 | 2 (in + out for OB) | 2 (in + out for everything) |
| Complexity vs B | simpler | baseline | **same as B** |
| Works for 50 symbols? | ❌ | ❌ trades still block | ✅ add more Workers |
| UI jank at extreme rates | ❌ yes | ⚠️ mostly fine | ✅ none |

---

## Why Not Move the WebSocket to the Worker Too?

You could. But the WebSocket has low CPU cost — receiving a message and pushing it to a buffer
is microseconds. The expensive part is **parsing and transforming** the data, not receiving it.

Also, the WebSocket owns the reconnect logic and subscription registry, which need to interact
with the Zustand store (`wsStatus`). Keeping it on the main thread is cleaner and easier
to debug.

---

## The One Real Downside of Option C

The Worker processes **sequentially**. If an orderbook aggregation takes 2ms while a trades
flush is waiting, the trades flush waits 2ms.

Is this a problem? No. The flush timers run at 50–200ms intervals. The Worker has plenty of
time to finish each job before the next one arrives. Sequential is fine here.

---

## What the Message Looks Like (Option C)

**Main → Worker** (every 50ms flush):
```json
{
  "orderBook": { "bids": [...500 levels], "asks": [...500 levels], "increment": 0.5, "symbol": "BTCUSD" },
  "trades":    [ ...20 parsed trade objects from last 100ms ],
  "tickers":   [ ...5 parsed ticker objects ]
}
```

**Worker → Main** (processed, ready for store):
```json
{
  "processedOrderBook": { "bids": [...20 grouped levels], "asks": [...15 grouped levels], "midPrice": 62561, ... },
  "aggregatedTrades":   [ ...5 merged rows ],
  "rollingStats":       { "buyVolume": 1200, "sellVolume": 800, "tradeCount": 45, "avgTradeSize": 44.4 },
  "tickers":            { "BTCUSD": { "lastPrice": 62561, "change24h": 0.67 }, ... }
}
```

The input crosses the thread boundary once. The output crosses back once. Two `postMessage`
calls per flush cycle — same as Option B.

---

## Verdict

**Build Option C from the start. Don't build Option B first.**

The complexity of Option B and Option C is identical — you need the Worker, the message bridge,
the stale-guard on the result, and the result routing into the store either way.

The only difference is what goes into the Worker's `onmessage` handler. Option B processes
one pipeline. Option C processes four. That's one extra function call per pipeline — maybe
5 lines of code more.

The benefit difference is large: Option B leaves 100ms/s on the main thread. Option C
leaves 10ms/s. React gets the full frame budget.

---

## Implementation Note

The `focusSeqId` stale-guard still applies in Option C. The Worker result carries the
`focusSeqId` that was current when the flush was dispatched. On receipt, main thread checks:

```typescript
worker.onmessage = ({ data }) => {
  if (data.seqId !== store.getState().focusSeqId) return  // discard stale result
  store.setOrderBook(data.processedOrderBook)
  store.setTrades(data.aggregatedTrades, data.rollingStats)
  store.updateTickers(data.tickers)
}
```

See `issues/20-orderbook-worker.md` for the full implementation spec (being updated to
reflect the all-pipelines approach).
