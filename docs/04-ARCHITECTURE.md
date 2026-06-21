# Architecture Document — Real-Time Crypto Derivatives Trading Dashboard

---

## 0. Backend Protocol Contract (from source)

These are facts derived from reading the backend source — not assumptions. Get these wrong
and the UI shows nothing or wrong data.

| Channel | Message shape | Notes |
|---------|--------------|-------|
| `l2_orderbook` | `{ type, symbol, bids: [price,size][], asks: [price,size][], timestamp }` | Full 500-level **snapshot** every message — NOT deltas. Sizes always > 0 (min 0.1). Timestamp in **microseconds**. |
| `all_trades` | `{ type, symbol, price, size, buyer_role, seller_role, timestamp, ... }` | **No `side` field.** Derive: `buyer_role==="taker"` → buy, `seller_role==="taker"` → sell. Size is integer 96–105. Timestamp in **microseconds**. |
| `v2/ticker` | `{ type, symbol, close, ltp_change_24h, mark_change_24h, quotes: {best_bid,best_ask,...}, ... }` | `ltp_change_24h` is a **multiplier** (1.0050 = +0.50%). Convert: `(ltp_change_24h - 1) * 100`. Last price = `close` field. |

**Critical parsing rules:**
- All timestamps divide by 1000 before any ms-based arithmetic (e.g. `Date(timestamp / 1000)`)
- Trade 100 ms bucket: `Math.floor(timestamp / 100_000)` (not `/100` — timestamps are μs)
- Orderbook levels destructure as `const [price, size] = level` — they are `[number, number]` tuples
- Ticker 24h change display: `((ltp_change_24h - 1) * 100).toFixed(2) + '%'`

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Browser Tab                                    │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      React Application                            │ │
│  │                                                                    │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │  TickerBar (always visible)                                  │ │ │
│  │  │  [BTCUSD] [ETHUSD] [XRPUSD] [SOLUSD] [PAXGUSD] [DOGEUSD]   │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │                                                                    │ │
│  │  ┌─────────────────────┐  ┌───────────────────────────────────┐  │ │
│  │  │  OrderBook Panel    │  │  TradesFeed Panel                 │  │ │
│  │  │  (focused symbol)   │  │  (focused symbol)                 │  │ │
│  │  └─────────────────────┘  └───────────────────────────────────┘  │ │
│  │                                                                    │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │  Zustand Store (external — not in React tree)                │ │ │
│  │  │  tickers | orderBook | trades | focusedSymbol | wsStatus     │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │                                                                    │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │  WebSocketManager (singleton, outside React)                 │ │ │
│  │  │  connection · subscription registry · reconnect timer        │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                          ▲ WS frames                                    │
└──────────────────────────┼──────────────────────────────────────────────┘
                           │  ws://localhost:8080
┌──────────────────────────┼──────────────────────────────────────────────┐
│              Stress-Test Backend                                         │
│   v2/ticker · l2_orderbook · all_trades  (per README)                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Flow (end-to-end)

```
WebSocket Frame arrives
        │
        ▼
WebSocketManager.onmessage()
  │  Routes by msg.type ('l2_orderbook' | 'all_trades' | 'v2/ticker')
  │  Calls registered handler
        │
        ├─── v2/ticker  ──────► tickerBuffer.current[symbol].push(rawString)
        │                                   (useRef — no render triggered)
        │
        ├─── l2_orderbook ────► orderBookBuffer.current.push(rawString)
        │
        └─── all_trades  ────► tradesBuffer.current.push(rawString)


setInterval(50 ms) — ORDER BOOK FLUSH:
  ├── Take latest snapshot from orderBookBuffer
  ├── pipelineWorker.postMessage({ type:'ob', raw, increment, symbol, seqId })
  │       ↓  Worker thread (pipelineWorker.ts):
  │       │  JSON.parse(raw)
  │       │  parseOrderBookMessage()
  │       └─ aggregateOrderBook() → ProcessedOrderBook
  │       ↑  worker.onmessage({ type:'ob', orderBook })
  └── zustand.setState({ orderBook })          ← 1 render for OrderBook panel

setInterval(100 ms) — TRADES FLUSH:
  ├── Take all accumulated rawStrings from tradesBuffer
  ├── pipelineWorker.postMessage({ type:'trades', raws, notionalThreshold, seqId, nowMs })
  │       ↓  Worker thread:
  │       │  raws.map(r => parseTradeMessage(JSON.parse(r)))
  │       │  aggregateTrades()  — 100 ms bucket merge, isLarge flag
  │       │  updateRollingDeque() + computeRollingStats()
  │       └─ → { trades, rollingStats }
  │       ↑  worker.onmessage({ type:'trades', trades, rollingStats })
  └── zustand.setState({ trades, rollingStats })   ← 1 render for TradesFeed

setInterval(200 ms) — TICKER FLUSH:
  ├── Take latest rawString per symbol from tickerBuffer
  ├── pipelineWorker.postMessage({ type:'tickers', raws })
  │       ↓  Worker thread:
  │       │  raws.map(r => parseTickerMessage(JSON.parse(r)))
  │       └─ mergeLatestTickers() → Partial<Record<Symbol, ParsedTicker>>
  │       ↑  worker.onmessage({ type:'tickers', tickers })
  └── zustand.setState({ tickers: { ...prev, ...tickers } })  ← renders only changed TickerCells
```

**Main-thread cost per flush:** The main thread only pushes raw strings into `useRef` buffers,
calls `worker.postMessage()`, and receives the compact processed result to write to the store.
JSON.parse, all pipeline CPU, and rolling-stats computation run entirely off the main thread.

---

## 3. Component Tree

```
<App>
  ├── <ConnectionStatus>          selector: wsStatus (memo-wrapped)
  ├── <BackendControl>            no store subscriptions — local state only
  ├── <TickerBar>
  │    ├── <TickerCell symbol="BTCUSD">   selector: tickers['BTCUSD']  +  useIsSymbolFocused('BTCUSD')
  │    ├── <TickerCell symbol="ETHUSD">   selector: tickers['ETHUSD']  +  useIsSymbolFocused('ETHUSD')
  │    └── ... (×6)
  │
  └── app__panels
       ├── <OrderBookPanel>        selector: orderBook  (also reads focusedSymbol for precision)
       │    ├── <GroupingSelector>  selector: groupingIncrement
       │    ├── <OrderBookRow>      React.memo — re-renders only when its level changes
       │    └── <SpreadBar>         React.memo
       │
       └── <TradesFeedPanel>       selector: trades  +  useFocusedSymbol (for threshold reset)
            ├── <RollingStatsBar>   selector: rollingStats; 1s setInterval reads via useRef
            ├── <VirtualTradeList>  react-window FixedSizeList (~15 DOM nodes always)
            └── <JumpToLatestButton>
```

**Render isolation guarantee:** Each component subscribes to a distinct Zustand selector.
Zustand's equality check (`Object.is`) ensures a re-render fires only when that slice
reference changes. Cross-panel renders are structurally impossible.

**TickerCell isolation refinement:** Each `TickerCell` subscribes to two boolean-returning
selectors — `tickers[symbol]` (data) and `useIsSymbolFocused(symbol)` (focus highlight).
Both return scalars or stable object references, so a focus switch only re-renders the two
cells whose `isFocused` boolean changed (old + new), not all six.

**React DevTools Profiler:** Enabled in dev mode via `define: { 'process.env.NODE_ENV': JSON.stringify(mode) }` in `vite.config.ts`, which ensures Vite's pre-bundler resolves the `react-dom` branch to the development build at runtime.

---

## 4. WebSocketManager

```typescript
class WebSocketManager {
  private ws: WebSocket | null = null
  private subscriptions: Map<string, MessageHandler>  // key = "channel:symbol"
  private reconnectDelay = 1000   // ms, doubles on each failure, capped at 30_000
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  connect(url: string): void
  disconnect(): void

  subscribe(channel: string, symbol: string, handler: MessageHandler): void
  unsubscribe(channel: string, symbol: string): void

  private onOpen(): void       // sends all active subscriptions; starts heartbeat
  private onClose(): void      // schedules reconnect with backoff
  private onMessage(e): void   // routes to registered handler
  private sendPing(): void     // keeps connection alive; detects silent drops
}
```

**Focus-switch sequence (atomic, no stale data):**
```
1.  focusSeqId++                                    ← increment generation counter FIRST
2.  wsManager.unsubscribe('l2_orderbook', oldSymbol)
3.  wsManager.unsubscribe('all_trades',   oldSymbol)
4.  zustand.setState({ orderBook: null, trades: [], rollingStats: null })
5.  orderBookBuffer.current = []
6.  tradesBuffer.current    = []
7.  groupingIncrement = SYMBOL_CONFIG[newSymbol].increments[0]  ← reset to finest increment
8.  focusedSymbol = newSymbol  (persisted to localStorage)
9.  wsManager.subscribe('l2_orderbook', newSymbol, orderBookHandler)
10. wsManager.subscribe('all_trades',   newSymbol, tradesHandler)
```

Steps 1–10 execute synchronously in a single event-loop tick. The `focusSeqId` counter
guards against stale snapshots: each flush handler captures the seqId at creation time and
discards any flush where `capturedSeqId !== currentSeqId`. This matters because the backend
sends full snapshots — a late snapshot from the old symbol would otherwise briefly appear.

---

## 5. Zustand Store Schema

```typescript
interface AppStore {
  // --- WebSocket ---
  wsStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  setWsStatus: (s: AppStore['wsStatus']) => void

  // --- Focus ---
  focusedSymbol: Symbol
  setFocusedSymbol: (s: Symbol) => void

  // --- Tickers ---
  tickers: Partial<Record<Symbol, TickerData>>
  updateTickers: (batch: Partial<Record<Symbol, TickerData>>) => void

  // --- Order Book ---
  orderBook: ProcessedOrderBook | null
  groupingIncrement: number
  setGroupingIncrement: (n: number) => void
  setOrderBook: (ob: ProcessedOrderBook) => void

  // --- Trades ---
  trades: AggregatedTrade[]          // capped at MAX_TRADES = 500
  rollingStats: RollingStats | null
  setTrades: (t: AggregatedTrade[], stats: RollingStats) => void
}
```

---

## 6. Order Book Aggregation Pipeline

Runs inside the 50 ms flush handler. Input: raw `{ bids, asks }` arrays from the WS frame.

```
Raw bids/asks (unsorted, full depth)
        │
        ▼
Step 1: Scale prices to integers
        price_int = Math.round(price * 10^precision)
        incr_int  = Math.round(increment * 10^precision)

        │
        ▼
Step 2: Group into Map<grouped_price_int, accumulated_size>
        bids: grouped_price = Math.floor(price_int / incr_int) * incr_int
        asks: grouped_price = Math.ceil (price_int / incr_int) * incr_int

        │
        ▼
Step 3: Sort
        bids: descending  (highest price first)
        asks: ascending   (lowest price first)

        │
        ▼
Step 4: Prefix-sum for cumulative size
        cumulativeSize[i] = cumulativeSize[i-1] + size[i]

        │
        ▼
Step 5: Scale depth bars
        depthWidth[i] = (cumulativeSize[i] / maxCumulative) * 100

        │
        ▼
Step 6: Compute metrics
        midPrice   = (asks[0].price + bids[0].price) / 2
        spread     = asks[0].price - bids[0].price
        spreadBps  = (spread / midPrice) * 10_000
        imbalance  = totalBidSize / totalAskSize

        │
        ▼
ProcessedOrderBook { bids, asks, midPrice, spread, spreadBps, imbalance }
```

**Complexity:** O(N log N) where N = number of raw levels (typically 50–200).
Benchmark target: < 2 ms for N = 200 on a mid-range laptop.

**Flash highlight detection:** After each aggregation, compare `newSize[price]` to
`prevSize[price]`. If `|newSize - prevSize| / prevSize > 0.10`, emit a flash event for
that row. The flash is managed via a CSS class toggled by a `setTimeout(clear, 400)`.

---

## 7. Trade Aggregation & Rolling Stats

### 7.1 100 ms aggregation window

```
trades buffer (raw, in arrival order)
        │
        ▼
Group by { price, bucket: Math.floor(timestamp / 100) }
        │   — same price within same 100 ms bucket → merge
        ▼
AggregatedTrade { time, price, side, size (sum), count }
        │
        ▼
Prepend to trades array (newest first), cap at MAX_TRADES = 500
```

### 7.2 Rolling 60-second stats (deque-based)

```typescript
// A time-ordered deque of raw trades kept for the last 60 s
const rollingDeque: RawTrade[] = []

onFlush(newTrades: RawTrade[]) {
  const cutoff = Date.now() - 60_000
  // Evict from front (oldest)
  while (rollingDeque[0]?.timestamp < cutoff) rollingDeque.shift()
  // Append new
  rollingDeque.push(...newTrades)
  // Recompute stats
  const stats = computeStats(rollingDeque)
}
```

Stats update is triggered by the same 100 ms flush, but the `RollingStatsBar` component
internally uses a 1-second `setInterval` to pull the latest value — preventing 10 re-renders
per second for what is visually a 1-second update.

---

## 8. Symbol Precision & Grouping Increments

Precision values sourced directly from backend `config.js` — must match exactly or grouping
math produces wrong bucket boundaries.

```typescript
const SYMBOL_CONFIG: Record<Symbol, {
  precision: number
  increments: number[]
  largeTradeThreshold: number   // ← notional (price × size) above which a trade is "large"
}> = {
  //                                                          largeTradeThreshold calibrated to
  //                                                          ~50% of midpoint notional so ~half
  //                                                          of trades qualify (backend size ≈ 100)
  BTCUSD:  { precision: 1, increments: [0.5,1,2,5,10,25,50,100],                  largeTradeThreshold: 3_000_000 },
  ETHUSD:  { precision: 2, increments: [0.05,0.1,0.5,1,2,5,10],                   largeTradeThreshold: 100_000   },
  XRPUSD:  { precision: 4, increments: [0.0001,0.0005,0.001,0.005,0.01],          largeTradeThreshold: 100       },
  SOLUSD:  { precision: 4, increments: [0.0001,0.0005,0.001,0.005,0.01],          largeTradeThreshold: 4_000     },
  PAXGUSD: { precision: 2, increments: [0.05,0.1,0.5,1,2,5,10],                   largeTradeThreshold: 250_000   },
  DOGEUSD: { precision: 6, increments: [0.000001,0.000005,0.00001,0.00005,0.0001],largeTradeThreshold: 2         },
}
```

**`largeTradeThreshold` reset rule:** When `focusedSymbol` changes, `TradesFeedPanel` resets
`notionalThreshold` state to `SYMBOL_CONFIG[newSymbol].largeTradeThreshold` via
`useEffect([focusedSymbol])`. The threshold `<input>` carries `key={focusedSymbol}` so React
remounts it (resetting the displayed value) without switching to a controlled input.

**Grouping increment reset rule:** When `focusedSymbol` changes, `groupingIncrement` resets
to `SYMBOL_CONFIG[newSymbol].increments[0]` (the finest increment). This happens atomically
in step 6 of the focus-switch sequence. Without this, an increment valid for BTCUSD (e.g.
50) would be applied to XRPUSD whose valid range is 0.0001–0.1, collapsing the entire book
into one bucket.

When the user changes the grouping increment, only the *grouping selector input* changes
in the store. The next 50 ms flush re-runs the aggregation with the new increment.

---

## 9. Performance Budget

| Operation | Thread | Frequency | Budget | Technique |
|-----------|--------|-----------|--------|-----------|
| WS message ingestion | Main | 1–200+ /s | < 0.1 ms | Push raw string to `useRef` array |
| OB JSON.parse + aggregation | **Worker** | 20 /s | < 2 ms (off main thread) | Integer arithmetic, Map, sort |
| Trade parse + aggregate + rolling stats | **Worker** | 10 /s | < 3 ms (off main thread) | Deque eviction, bucket merge |
| Ticker parse + merge | **Worker** | 5 /s | < 1 ms (off main thread) | Latest-value-per-symbol merge |
| `postMessage` (main→worker) | Main | 20 /s | < 0.1 ms | Raw strings (no clone cost) |
| `postMessage` (worker→main) | Main | 20 /s | < 0.1 ms | Compact processed results |
| Zustand store write | Main | 20 /s | < 0.2 ms | Single `setState` per flush |
| React render (per panel) | Main | max 20 /s | < 5 ms | Atomic selector, react-window |
| Flash detection | Main | 20 /s | < 0.5 ms | Previous-size Map lookup, DOM class |
| **Total main-thread budget** | — | — | **< 6 ms / 50 ms frame** | Worker offloads all pipeline CPU |

---

## 10. File / Module Layout

```
src/
├── ws/
│   ├── WebSocketManager.ts     singleton connection manager
│   └── index.ts                singleton export (wsManager)
│
├── store/
│   ├── store.ts                Zustand store definition + actions
│   ├── hooks.ts                typed selector hooks (one per component type)
│   └── index.ts                re-exports
│
├── pipelines/
│   ├── parsers.ts              WS message → typed domain objects
│   ├── orderBookPipeline.ts    aggregation + metrics + flash detection
│   ├── tradePipeline.ts        window merge + isLarge flag
│   ├── rollingStatsPipeline.ts deque eviction + stats computation
│   └── tickerPipeline.ts       latest-value merge
│
├── workers/
│   ├── pipelineWorker.ts       DedicatedWorker — runs all 3 pipelines off main thread
│   ├── workerInstance.ts       singleton Worker export
│   └── workerTypes.ts          WorkerInput / WorkerOutput discriminated unions
│
├── hooks/
│   ├── useWebSocket.ts         mounts WS subscriptions, runs focus-switch sequence
│   ├── useOrderBookFlush.ts    50 ms flush → pipelineWorker (ob)
│   ├── useTradesFlush.ts       100 ms flush → pipelineWorker (trades)
│   └── useTickerBar.ts         200 ms flush → pipelineWorker (tickers)
│
├── components/
│   ├── TickerBar/
│   │   ├── TickerBar.tsx        no store subscriptions — renders 6 TickerCell children
│   │   └── TickerCell.tsx       selector: tickers[symbol] + useIsSymbolFocused(symbol)
│   ├── OrderBook/
│   │   ├── OrderBookPanel.tsx   selector: orderBook; stable rowRef callbacks via Map cache
│   │   ├── OrderBookRow.tsx     React.memo — re-renders only when its level changes
│   │   ├── SpreadBar.tsx        React.memo
│   │   └── GroupingSelector.tsx selector: groupingIncrement
│   ├── TradesFeed/
│   │   ├── TradesFeedPanel.tsx  selector: trades + focusedSymbol; resets threshold on switch
│   │   ├── RollingStatsBar.tsx  selector: rollingStats; useRef + 1s setInterval display gate
│   │   ├── VirtualTradeList.tsx react-window FixedSizeList (~15 DOM nodes)
│   │   └── JumpToLatestButton.tsx
│   ├── ConnectionStatus/
│   │   └── ConnectionStatus.tsx selector: wsStatus (memo-wrapped)
│   └── BackendControl/
│       └── BackendControl.tsx   no store subscriptions; HTTP control panel for backend rate
│
├── config/
│   └── symbols.ts              SYMBOL_CONFIG: precision + increments + largeTradeThreshold
│
└── utils/
    └── detectFlashes.ts        prev/curr size Map comparison → flash direction map
```

---

## 11. Reconnection & Resilience

```
Connection drops
        │
        ▼
onClose fires → wsStatus = 'reconnecting'
        │
        ▼
setTimeout(reconnect, delay)
delay: 1s → 2s → 4s → 8s → 16s → 30s (capped)
        │
        ▼
new WebSocket(url)
        │
        ▼
onOpen fires → replay all subscriptions from registry
             → wsStatus = 'connected'
             → delay reset to 1s
```

Silent drops (proxy timeout, no close frame) are caught by a 30-second ping/pong
heartbeat. If no pong arrives within 5 seconds of a ping, the socket is forcibly closed,
triggering the normal reconnect path.

---

## 12. Scaling Analysis — 50 Symbols

At 50 symbols × (1 orderbook + 1 trades + 1 ticker) = 150 channels:

**What breaks first:**
1. **Main-thread aggregation:** 50 order book aggregations at 20 /s = 1,000 pipeline
   executions/s. At 2 ms each = 2,000 ms/s — impossible on one thread.
2. **React reconciler:** 150 Zustand slice updates at 20 /s = 3,000 renders/s.
3. **Memory:** 50 × 500-trade arrays = 25,000 objects + 60 s rolling deques.

**Redesign path (documented, not implemented):**

```
Background Web Worker
  ├── Owns the WebSocket connection
  ├── Runs all aggregation pipelines
  ├── Writes results into SharedArrayBuffers (zero-copy)
  └── Posts a dirty-flags message to main thread

Main Thread
  ├── Reads SABs directly in render functions
  ├── Uses OffscreenCanvas + WebGL for dense order book rendering
  └── React handles only layout shell and user controls
```

This architecture can handle 50 symbols because computation never touches the main thread,
and rendering bypasses React's virtual DOM for high-frequency panels.

---

## 13. Web Worker Pipeline (Implemented)

All three pipelines — orderbook, trades, tickers — run in `src/workers/pipelineWorker.ts`
(a `DedicatedWorkerGlobalScope`). The main thread only pushes raw JSON strings into `useRef`
buffers, sends them to the Worker on each flush tick, and writes the compact processed result
to the Zustand store.

### Message protocol

```typescript
// Main → Worker
type WorkerInput =
  | { type: 'ob';     seqId: number; symbol: Symbol; increment: number; raw: string }
  | { type: 'trades'; seqId: number; notionalThreshold: number; nowMs: number; raws: string[] }
  | { type: 'tickers'; raws: string[] }

// Worker → Main
type WorkerOutput =
  | { type: 'ob';     seqId: number; orderBook: ProcessedOrderBook }
  | { type: 'trades'; seqId: number; trades: AggregatedTrade[]; rollingStats: RollingStats }
  | { type: 'tickers'; tickers: Partial<Record<Symbol, ParsedTicker>> }
```

### What runs where

| Operation | Thread | Notes |
|-----------|--------|-------|
| WebSocketManager + heartbeat | Main | Requires DOM / store access |
| `useRef` buffer push (raw strings) | Main | Zero-cost — no parse, no render |
| `postMessage` to Worker | Main | Transfers raw strings (small clone cost) |
| JSON.parse for all 3 channels | **Worker** | Largest single CPU cost removed from main |
| `parseOrderBookMessage` + `aggregateOrderBook` | **Worker** | Integer math, sort, prefix-sum, depth bars |
| `parseTradeMessage` + `aggregateTrades` + rolling stats | **Worker** | Deque eviction, bucket merge, isLarge flag |
| `parseTickerMessage` + `mergeLatestTickers` | **Worker** | Latest-value-per-symbol merge |
| Zustand store writes | Main | Workers cannot access the DOM or Zustand |
| React reconciler + render | Main | DOM — always main thread |

### stale-snapshot guard in the Worker

The Worker holds its own `existingTrades` array and `rollingDeque` for the trades pipeline.
When `seqId` changes (symbol switch detected), the Worker clears both immediately:

```typescript
if (seqId !== lastSeqId) {
  existingTrades = []
  rollingDeque = []
  lastSeqId = seqId
}
```

This mirrors the focus-switch `focusSeqId` guard on the main thread — any in-flight Worker
result carrying the old `seqId` is discarded by the flush handler before writing to the store.

### Structured-clone cost rationale

The raw orderbook snapshot (500 price levels × 2 sides as a JSON string) is passed to the
Worker once per flush as a plain `string`. Strings transfer cheaply. The Worker returns the
aggregated result (15–50 grouped levels as a compact object) — 10–25× smaller than the raw
input. Always pay the structured-clone cost on the smaller, already-aggregated value.

### 50-symbol scaling path

At 50 symbols × 3 channels = 150 concurrent streams, the Worker model composes naturally:
the same `pipelineWorker.ts` handles all symbols in sequence within each flush tick.
The main thread cost remains bounded regardless of symbol count. For extreme throughput
(50 × 100 snapshots/s), the next step is a `SharedArrayBuffer` ring buffer to eliminate
`postMessage` round-trips entirely — see §12 for the full scaling analysis.
