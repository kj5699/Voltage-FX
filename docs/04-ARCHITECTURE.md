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
  │  Parses JSON
  │  Looks up handler by { channel, symbol }
  │  Calls registered handler
        │
        ├─── v2/ticker  ──────► tickerBuffer.current[symbol].push(msg)
        │                                   (useRef — no render triggered)
        │
        ├─── l2_orderbook ────► orderBookBuffer.current.push(msg)
        │
        └─── all_trades  ────► tradesBuffer.current.push(msg)


setInterval(50 ms) — ORDER BOOK FLUSH:
  ├── Take latest snapshot from orderBookBuffer
  ├── Run aggregation pipeline (grouping, cumulative sums, depth bars, metrics)
  └── zustand.setState({ orderBook: processed })   ← 1 render for OrderBook panel

setInterval(100 ms) — TRADES FLUSH:
  ├── Take all accumulated trades
  ├── Merge within 100 ms windows at same price
  ├── Update rolling 60 s window (deque eviction)
  └── zustand.setState({ trades: merged, rollingStats })   ← 1 render for TradesFeed

setInterval(200 ms) — TICKER FLUSH:
  ├── Take latest value per symbol
  └── zustand.setState({ tickers: { ...tickers, ...latest } })  ← renders only changed TickerCells
```

---

## 3. Component Tree

```
<App>
  ├── <ConnectionStatus>          reads wsStatus slice
  ├── <TickerBar>
  │    ├── <TickerCell symbol="BTCUSD">   selector: tickers['BTCUSD']
  │    ├── <TickerCell symbol="ETHUSD">   selector: tickers['ETHUSD']
  │    └── ... (×6)
  │
  └── <MainLayout>
       ├── <OrderBookPanel>        selector: orderBook
       │    ├── <GroupingSelector>
       │    ├── <AskTable>
       │    ├── <SpreadBar>
       │    └── <BidTable>
       │
       └── <TradesFeedPanel>       selector: trades + rollingStats
            ├── <RollingStatsBar>
            ├── <VirtualTradeList>  (react-window FixedSizeList)
            └── <JumpToLatestButton>
```

**Render isolation guarantee:** Each component subscribes to a distinct Zustand selector.
Zustand's equality check (`Object.is`) ensures a re-render fires only when that slice
reference changes. Cross-panel renders are structurally impossible.

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
const SYMBOL_CONFIG: Record<Symbol, { precision: number; increments: number[] }> = {
  BTCUSD:  { precision: 1, increments: [1, 5, 10, 50, 100, 500] },
  ETHUSD:  { precision: 2, increments: [0.5, 1, 5, 10, 50] },
  XRPUSD:  { precision: 4, increments: [0.0001, 0.001, 0.01, 0.1] },
  SOLUSD:  { precision: 4, increments: [0.001, 0.005, 0.01, 0.05, 0.1] },  // 4dp per backend
  PAXGUSD: { precision: 2, increments: [0.5, 1, 5, 10, 50] },
  DOGEUSD: { precision: 6, increments: [0.000001, 0.00001, 0.0001, 0.001] }, // 6dp per backend
}
```

**Grouping increment reset rule:** When `focusedSymbol` changes, `groupingIncrement` resets
to `SYMBOL_CONFIG[newSymbol].increments[0]` (the finest increment). This happens atomically
in step 6 of the focus-switch sequence. Without this, an increment valid for BTCUSD (e.g.
50) would be applied to XRPUSD whose valid range is 0.0001–0.1, collapsing the entire book
into one bucket.

When the user changes the grouping increment, only the *grouping selector input* changes
in the store. The next 50 ms flush re-runs the aggregation with the new increment.

---

## 9. Performance Budget

| Operation | Frequency | Budget | Technique |
|-----------|-----------|--------|-----------|
| WS message ingestion | 1–200+ /s | < 0.1 ms | Push to `useRef` array only |
| Ticker flush | 5 /s | < 2 ms | Latest-value-per-symbol merge |
| Order book aggregation | 20 /s | < 2 ms | Integer arithmetic, Map, sort |
| Trade aggregation + rolling stats | 10 /s | < 3 ms | Deque eviction, bucket merge |
| React render (per panel) | max 20 /s | < 5 ms | Zustand selector, react-window |
| Flash detection | 20 /s | < 0.5 ms | Previous-size Map lookup |
| **Total main-thread budget** | — | **< 13 ms / 50 ms frame** | — |

---

## 10. File / Module Layout

```
src/
├── ws/
│   ├── WebSocketManager.ts     singleton connection manager
│   └── types.ts                WS message types
│
├── store/
│   ├── appStore.ts             Zustand store definition
│   └── selectors.ts            typed selector hooks
│
├── pipelines/
│   ├── orderBookPipeline.ts    aggregation + metrics
│   ├── tradePipeline.ts        window merge + rolling stats
│   └── tickerPipeline.ts       latest-value merge
│
├── hooks/
│   ├── useWebSocket.ts         mounts/unmounts WS subscriptions
│   ├── useOrderBook.ts         buffer flush + pipeline trigger
│   └── useTrades.ts            buffer flush + pipeline trigger
│
├── components/
│   ├── TickerBar/
│   │   ├── TickerBar.tsx
│   │   └── TickerCell.tsx
│   ├── OrderBook/
│   │   ├── OrderBookPanel.tsx
│   │   ├── AskTable.tsx
│   │   ├── BidTable.tsx
│   │   ├── SpreadBar.tsx
│   │   └── GroupingSelector.tsx
│   └── TradesFeed/
│       ├── TradesFeedPanel.tsx
│       ├── RollingStatsBar.tsx
│       ├── VirtualTradeList.tsx
│       └── JumpToLatestButton.tsx
│
├── config/
│   └── symbols.ts              SYMBOL_CONFIG table
│
└── utils/
    ├── precision.ts            scale/unscale helpers
    └── time.ts                 formatTime, bucket helpers
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

## 13. Web Worker Optimization Strategy (Production Path)

> Full analysis in `docs/06-OPTIMIZATION-PLAN.md`. This section captures the architectural decision.

### What the current architecture leaves on the main thread

The buffer-flush pattern (50/100/200ms intervals) decouples message rate from render rate — React sees at most 20 `setState` calls/second regardless of WebSocket throughput. That problem is solved.

What is **not** solved: at stress rates (orderbook at 10–20ms = 50–100 snapshots/s), `JSON.parse` of 500-level snapshots (~50KB each) consumes **200–300ms/s** of main thread time — up to 30% of total budget, before React even runs.

### Chosen mitigation: Worker for orderbook aggregation only

Move the most expensive operation — orderbook parse + aggregate — to a dedicated Worker. Keep the WebSocket on the main thread (small trade messages don't justify the Worker overhead).

```
Main thread:
  WS.onmessage → JSON.parse(raw)
    → worker.postMessage(ParsedOrderBook)   // 500 levels, raw

Worker thread:
  aggregateOrderBook(bids, asks, increment, symbol)
  // sort, prefix-sum, depth bars — all CPU-bound
    → postMessage(ProcessedOrderBook)        // 20–50 grouped levels

Main thread:
  store.setOrderBook(result)
  React renders OrderBookPanel
```

### Why this split

Structured clone cost is proportional to object size. The raw snapshot (500 levels × 2 sides) is large. The processed result (20–50 grouped levels after aggregation) is 10–25× smaller. Always pay the clone cost on the smaller object — so the Worker returns the result, not the input.

Trade messages (200 bytes each) don't justify a Worker round-trip. The `postMessage` overhead would exceed the parse cost.

### What stays on the main thread permanently

| Layer | Reason |
|-------|--------|
| WebSocketManager | Reconnect + heartbeat coordination requires store access |
| Trade parse + aggregate | Tiny payloads — Worker overhead > benefit |
| Ticker parse + merge | Same — 200ms flush, negligible CPU |
| Zustand store writes | Workers have no DOM/store access |
| React render | DOM only — always main thread |

### Implementation: Issue 20

See `issues/20-orderbook-worker.md`. Not implemented in the current version — the buffer-flush architecture handles the assignment's evaluation criteria. This is the documented next step for production load.
