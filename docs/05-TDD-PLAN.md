# TDD Implementation Plan — Real-Time Trading Dashboard

## Testing Stack

| Tool | Role |
|------|------|
| **Vitest** | Test runner (faster than Jest, native ESM, compatible with Vite) |
| **React Testing Library** | Component tests (behaviour over implementation) |
| **MSW (Mock Service Worker)** | Intercepts WebSocket at the network level for integration tests |
| **@testing-library/user-event** | Simulates real user interactions |
| **vitest-websocket-mock** | Lightweight WS mock for unit tests of WebSocketManager |
| **Playwright** | E2E smoke tests (real browser, real WS connection) |

---

## TDD Cycle Applied Per Phase

```
RED   → Write a failing test that describes the desired behaviour
GREEN → Write the minimum code to make it pass
BLUE  → Refactor while keeping tests green
```

---

## Phase 0 — Project Scaffold

### Tasks
- `npm create vite@latest` with React + TypeScript template
- Install: `zustand react-window vitest @testing-library/react @testing-library/user-event msw vitest-websocket-mock`
- Configure Vitest (`vitest.config.ts`), `jsdom` environment, coverage thresholds (80%)
- Set up `src/` directory layout as defined in architecture doc
- Configure path aliases (`@ws`, `@store`, `@pipelines`, etc.)
- Add ESLint with `@typescript-eslint` and `no-explicit-any` rule
- Add Tailwind CSS

### Test Scenarios (Phase 0)

**T0-1: Build pipeline smoke test**
```
GIVEN the project is scaffolded
WHEN  npm run build
THEN  exits 0 with no TypeScript errors
```

**T0-2: Test runner smoke test**
```
GIVEN vitest is configured
WHEN  npm test
THEN  the example placeholder test passes
```

---

## Phase 1 — WebSocketManager

**Principle:** The WS manager is pure TypeScript (no React). Test it with `vitest-websocket-mock`.

### Tasks
- Implement `WebSocketManager` class (`src/ws/WebSocketManager.ts`)
- Implement message routing (`channel:symbol` key)
- Implement subscription replay on reconnect
- Implement exponential backoff reconnect
- Implement ping/pong heartbeat

### Test Scenarios (Phase 1)

**T1-1: Single connection on init**
```
GIVEN WebSocketManager is constructed with a URL
WHEN  connect() is called
THEN  exactly one WebSocket is opened to that URL
AND   wsStatus becomes 'connected'
```

**T1-2: Message routing to correct handler**
```
GIVEN two handlers: handlerA subscribed to 'v2/ticker:BTCUSD'
                    handlerB subscribed to 'v2/ticker:ETHUSD'
WHEN  a message arrives for 'v2/ticker:BTCUSD'
THEN  handlerA is called once
AND   handlerB is NOT called
```

**T1-3: Subscription sends correct payload to server**
```
GIVEN a fresh manager
WHEN  subscribe('l2_orderbook', 'ETHUSD', handler) is called
THEN  the outgoing WS frame matches the backend's subscribe format exactly
```

**T1-4: Unsubscribe removes handler and sends unsub frame**
```
GIVEN handlerA is subscribed to 'all_trades:BTCUSD'
WHEN  unsubscribe('all_trades', 'BTCUSD') is called
AND   a subsequent message arrives for that channel
THEN  handlerA is NOT called
AND   an unsubscribe frame was sent to the server
```

**T1-5: Reconnect replays active subscriptions**
```
GIVEN subscribe('v2/ticker', 'BTCUSD', handler) is called
WHEN  the WebSocket closes unexpectedly
AND   the manager reconnects successfully
THEN  a subscribe frame for 'v2/ticker:BTCUSD' is re-sent automatically
```

**T1-6: Exponential backoff on repeated failures**
```
GIVEN the server is unavailable
WHEN  connection fails 4 times in a row
THEN  reconnect delays are approximately 1s, 2s, 4s, 8s
AND   delay does not exceed 30s
```

**T1-7: Heartbeat detects silent drop**
```
GIVEN an open connection with a 5s pong timeout
WHEN  the server stops responding to pings for 6s
THEN  the socket is closed and a reconnect is initiated
```

**T1-8: Clean disconnect**
```
GIVEN an open connection
WHEN  disconnect() is called
THEN  the socket closes cleanly
AND   no reconnect timer is started
```

---

## Phase 2 — Pipelines (Pure Functions)

These are the most important unit tests. Pipelines are stateless pure functions — easy to
test exhaustively.

### Tasks
- Implement `src/pipelines/orderBookPipeline.ts`
- Implement `src/pipelines/tradePipeline.ts`
- Implement `src/pipelines/tickerPipeline.ts`
- Implement `src/config/symbols.ts` (SYMBOL_CONFIG)
- Implement `src/utils/precision.ts`

### Backend Protocol Tests (Phase 2 — must pass before any pipeline test)

**T2-0a: Orderbook tuple destructuring**
```
GIVEN raw WS message bids = [[62341.5, 1.23], [62340.0, 0.87]]
WHEN  parseOrderBook(msg) is called
THEN  result.bids = [{ price: 62341.5, size: 1.23 }, { price: 62340.0, size: 0.87 }]
      (arrays destructured to objects — NOT .price/.size accessed on array)
```

**T2-0b: Trade side derivation from buyer_role/seller_role**
```
GIVEN trade = { buyer_role: 'taker', seller_role: 'maker', price: 100, size: 1 }
WHEN  parseTrade(trade) is called
THEN  result.side = 'buy'   (buyer is taker = aggressor)

GIVEN trade = { buyer_role: 'maker', seller_role: 'taker', price: 100, size: 1 }
THEN  result.side = 'sell'  (seller is taker = aggressor)
```

**T2-0c: Ticker 24h change multiplier conversion**
```
GIVEN ticker msg ltp_change_24h = 1.0234  (means +2.34%)
WHEN  parseTicker(msg) is called
THEN  result.change24h = 2.34   (percentage, not multiplier)
      result.lastPrice = msg.close
```

**T2-0d: Microsecond timestamp normalisation**
```
GIVEN trade.timestamp = 1718500000000000  (microseconds)
WHEN  parseTrade(trade) is called
THEN  result.timestampMs = 1718500000000  (milliseconds, divided by 1000)
      new Date(result.timestampMs) is a valid date
```

**T2-0e: Trade 100ms bucket uses millisecond timestamp**
```
GIVEN two trades at microsecond timestamps 1718500000000000 and 1718500000050000
      (50ms apart, same price)
WHEN  aggregateTrades([t1, t2], bucketMs=100) is called
THEN  they merge into one row  (both fall in same 100ms bucket after μs→ms conversion)
```

---

### Test Scenarios — Order Book Pipeline (Phase 2)

**T2-1: Basic aggregation at increment 1 (no-op grouping)**
```
GIVEN bids = [{price: 100.0, size: 2}, {price: 99.0, size: 3}]
      asks = [{price: 101.0, size: 1}, {price: 102.0, size: 4}]
      increment = 1
WHEN  aggregateOrderBook(bids, asks, increment, precision=1) is called
THEN  bids sorted descending: [100.0→2, 99.0→3]
      asks sorted ascending:  [101.0→1, 102.0→4]
```

**T2-2: Grouping aggregates sizes correctly**
```
GIVEN bids = [{price: 100.4, size: 1}, {price: 100.1, size: 2}, {price: 99.8, size: 3}]
      increment = 1, precision = 1
WHEN  pipeline runs
THEN  bid at 100.0 = size 3  (100.4 → floor to 100, 100.1 → floor to 100)
      bid at 99.0  = size 3  (99.8  → floor to 99)
```

**T2-3: Ask ceiling grouping never overlaps bids**
```
GIVEN a bid at 100.0 and an ask at 100.1
      increment = 1, precision = 1
WHEN  pipeline runs
THEN  ask grouped price = 101.0  (ceiling)
AND   ask_price > bid_price (spread preserved)
```

**T2-4: Cumulative sizes are prefix sums**
```
GIVEN asks = [{price:101, size:2}, {price:102, size:3}, {price:103, size:5}]
WHEN  pipeline runs
THEN  ask cumulative = [2, 5, 10]
```

**T2-5: Depth bar widths scale to max cumulative**
```
GIVEN bids with maxCumulative=10, asks with maxCumulative=20
WHEN  pipeline runs
THEN  ask with cumulativeSize=20 has depthWidth=100
      ask with cumulativeSize=10 has depthWidth=50
      bid with cumulativeSize=10 has depthWidth=100  (relative to bid max)
```

**T2-6: Spread metrics are correct**
```
GIVEN best ask = 101.5, best bid = 100.0
WHEN  pipeline runs
THEN  midPrice   = 100.75
      spread     = 1.5
      spreadBps  ≈ 14.89 bps  (1.5 / 100.75 * 10_000)
```

**T2-7: Imbalance calculation**
```
GIVEN total visible bid size = 10, total visible ask size = 5
WHEN  pipeline runs
THEN  imbalance = 2.0  (bid heavy)
```

**T2-8: XRPUSD precision grouping (4dp)**
```
GIVEN bids at [1.4523, 1.4521, 1.4498]  precision=4  increment=0.001
WHEN  pipeline runs
THEN  bid at 1.452 = size of first two levels (floor(1.4523/0.001)*0.001 = 1.452)
      bid at 1.449 = size of third level
```

**T2-8b: SOLUSD precision grouping (4dp — NOT 2dp)**
```
GIVEN SOLUSD bids at [74.2310, 74.2290]  precision=4  increment=0.005
WHEN  pipeline runs
THEN  bid at 74.230 = size of both levels  (floor(74.2310/0.005)*0.005 = 74.230)
      NOT bucketed at 74.23 (2dp) — backend sends 4dp prices
```

**T2-8c: DOGEUSD precision grouping (6dp — NOT 4dp)**
```
GIVEN DOGEUSD bids at [0.082341, 0.082339]  precision=6  increment=0.00001
WHEN  pipeline runs
THEN  bid at 0.08233 = size of both levels
```

**T2-9: Empty book returns nulls for metrics**
```
GIVEN bids = []  asks = []
WHEN  pipeline runs
THEN  result.midPrice = null
      result.spread   = null
      result.bids     = []
      result.asks     = []
```

**T2-10: Flash detection — size increase > 10%**
```
GIVEN previousSizes = { 100.0: 5.0 }
      newSizes      = { 100.0: 5.6 }  (12% increase)
WHEN  detectFlashes(prev, next) is called
THEN  result = { 100.0: 'increase' }
```

**T2-11: Flash detection — size decrease > 10%**
```
GIVEN previousSizes = { 100.0: 5.0 }
      newSizes      = { 100.0: 4.4 }  (12% decrease)
THEN  result = { 100.0: 'decrease' }
```

**T2-12: Flash detection — change ≤ 10% produces no flash**
```
GIVEN previousSizes = { 100.0: 5.0 }
      newSizes      = { 100.0: 5.4 }  (8% increase)
THEN  result = {}
```

### Test Scenarios — Trade Pipeline (Phase 2)

**T2-13: Trades at same price within 100 ms merge**
```
GIVEN trades = [
  { timestamp: 1000, price: 100.0, size: 1.0, side: 'buy' },
  { timestamp: 1050, price: 100.0, size: 2.0, side: 'buy' },
  { timestamp: 1099, price: 100.0, size: 0.5, side: 'buy' },
]
WHEN  aggregateTrades(trades, bucketMs=100) is called
THEN  result = [{ price:100.0, size:3.5, count:3, side:'buy', time:1000 }]
```

**T2-14: Trades at same price but different 100 ms buckets do NOT merge**
```
GIVEN trades at price=100.0 at timestamps 50 and 150
WHEN  aggregateTrades runs
THEN  result has 2 separate rows
```

**T2-15: Trades at different prices in the same bucket do NOT merge**
```
GIVEN trades at timestamps 10 and 50: prices 100.0 and 101.0
WHEN  aggregateTrades runs
THEN  result has 2 rows with distinct prices
```

**T2-16: Large trade flag when notional exceeds threshold**
```
GIVEN threshold = 10_000
      trade = { price: 5000, size: 3.0 }   (notional = 15_000)
WHEN  pipeline runs
THEN  trade.isLarge = true
```

**T2-17: Trade array capped at MAX_TRADES**
```
GIVEN existing trades array has 500 entries  (MAX_TRADES)
WHEN  10 new aggregated trades are added
THEN  array.length = 500  (oldest 10 evicted)
```

### Test Scenarios — Rolling Stats (Phase 2)

**T2-18: Rolling stats include only trades within last 60 s**
```
GIVEN trades at t=0s (size=1 buy), t=30s (size=2 sell), t=90s (size=3 buy)
      current time = 100s
WHEN  computeRollingStats(deque, now=100s) is called
THEN  buyVolume  = 2 (only t=90s is within 60s window for buys... wait)
      — actually t=30s sell + t=90s buy are within window; t=0s is outside
      buyVolume  = 3
      sellVolume = 2
      tradeCount = 2
```

**T2-19: Stats bar updates on 1-second boundary**
```
GIVEN the RollingStatsBar component is mounted
WHEN  500 ms pass
THEN  the displayed values have NOT changed
WHEN  another 500 ms pass (total 1s)
THEN  the displayed values update once
```

### Test Scenarios — Ticker Pipeline (Phase 2)

**T2-20: Latest-value merge deduplicate per symbol**
```
GIVEN buffer = [
  { symbol:'BTCUSD', price:100, change:1 },
  { symbol:'BTCUSD', price:101, change:1.1 },  ← latest
  { symbol:'ETHUSD', price:200, change:-0.5 },
]
WHEN  mergeLatestTickers(buffer) is called
THEN  result = { BTCUSD: {price:101, change:1.1}, ETHUSD: {price:200, change:-0.5} }
```

---

## Phase 3 — Zustand Store

### Tasks
- Implement `src/store/appStore.ts`
- Implement `src/store/selectors.ts`

### Test Scenarios (Phase 3)

**T3-1: Initial state is correct**
```
GIVEN the store is initialised
THEN  focusedSymbol = 'BTCUSD'
      tickers       = {}
      orderBook     = null
      trades        = []
      wsStatus      = 'connecting'
```

**T3-2: updateTickers merges without losing other symbols**
```
GIVEN tickers = { BTCUSD: {...}, ETHUSD: {...} }
WHEN  updateTickers({ BTCUSD: { price: 999 } }) is called
THEN  tickers.BTCUSD.price = 999
AND   tickers.ETHUSD is unchanged
```

**T3-3: focusedSymbol persisted to localStorage**
```
GIVEN setFocusedSymbol('ETHUSD') is called
THEN  localStorage.getItem('focusedSymbol') = 'ETHUSD'
```

**T3-4: focusedSymbol restored from localStorage on init**
```
GIVEN localStorage contains focusedSymbol = 'SOLUSD'
WHEN  the store is initialised
THEN  store.focusedSymbol = 'SOLUSD'
```

**T3-5: setTrades caps array at MAX_TRADES**
```
GIVEN MAX_TRADES = 500
WHEN  setTrades is called with 600 trades
THEN  store.trades.length = 500
```

---

## Phase 4 — Hooks (Integration Layer)

### Tasks
- `useWebSocket.ts` — mounts/unmounts WS subscriptions
- `useOrderBook.ts` — buffer + flush → pipeline → store
- `useTrades.ts` — buffer + flush → pipeline → store
- `useTickerBar.ts` — buffer + flush → store

### Test Scenarios (Phase 4)

**T4-1: useOrderBook subscribes on mount and unsubscribes on unmount**
```
GIVEN useOrderBook is used in a component
WHEN  the component mounts
THEN  wsManager.subscribe('l2_orderbook', symbol) was called
WHEN  the component unmounts
THEN  wsManager.unsubscribe('l2_orderbook', symbol) was called
```

**T4-2: useOrderBook clears stale data on symbol change**
```
GIVEN component is mounted with symbol='BTCUSD'
      orderBook store has data
WHEN  symbol changes to 'ETHUSD'
THEN  store.orderBook becomes null immediately
AND   new subscription is opened for 'ETHUSD'
```

**T4-2b: Grouping increment resets to finest on symbol change**
```
GIVEN focusedSymbol='BTCUSD', groupingIncrement=500
WHEN  user switches to 'XRPUSD'
THEN  store.groupingIncrement = 0.0001  (finest increment for XRPUSD)
AND   the previous increment 500 is not applied to any XRPUSD orderbook flush
```

**T4-2c: Stale snapshot from old symbol discarded after focus switch**
```
GIVEN focusedSymbol switches from 'BTCUSD' to 'ETHUSD'  (focusSeqId increments)
WHEN  a delayed BTCUSD orderbook snapshot arrives in the buffer after the switch
AND   the 50ms flush fires
THEN  store.orderBook is NOT updated with BTCUSD data
      (flush handler checks capturedSeqId !== currentSeqId → discards)
```

**T4-3: useOrderBook throttles store updates to flush interval**
```
GIVEN flush interval = 50 ms
WHEN  100 WS messages arrive within 50 ms
THEN  store.setOrderBook is called exactly once after 50 ms
```

**T4-4: useTrades auto-scroll state initialises to true**
```
GIVEN TradesFeedPanel mounts
THEN  isAutoScrollLocked = true
```

---

## Phase 5 — Components

Use React Testing Library. Test behaviour, not implementation.

### Test Scenarios — TickerBar (Phase 5)

**T5-1: All 6 ticker cells render**
```
GIVEN TickerBar is rendered with mock store (6 symbols)
THEN  6 ticker cell elements are present in the DOM
```

**T5-2: Price colour coding**
```
GIVEN ticker BTCUSD has change24h = +2.34%
THEN  the change element has a green colour class
GIVEN ticker ETHUSD has change24h = -1.12%
THEN  the change element has a red colour class
```

**T5-3: Clicking a ticker sets focusedSymbol**
```
GIVEN TickerBar is rendered
WHEN  user clicks the ETHUSD ticker cell
THEN  store.focusedSymbol = 'ETHUSD'
```

**T5-4: Focused symbol is visually highlighted**
```
GIVEN focusedSymbol = 'SOLUSD'
THEN  the SOLUSD ticker cell has the 'focused' CSS class
AND   no other ticker cell has that class
```

**T5-5: BTCUSD update does NOT re-render ETHUSD cell (render isolation)**
```
GIVEN TickerBar is rendered
      renderCount for ETHUSD cell = 1
WHEN  store.tickers.BTCUSD is updated
THEN  renderCount for ETHUSD cell is STILL 1
```

### Test Scenarios — OrderBook Panel (Phase 5)

**T5-6: Asks display in ascending order (lowest price first)**
```
GIVEN asks = [{price:102}, {price:101}, {price:103}]
WHEN  OrderBook panel renders
THEN  DOM order of ask rows: 101, 102, 103  (ascending)
```

**T5-7: Bids display in descending order**
```
GIVEN bids = [{price:99}, {price:100}, {price:98}]
THEN  DOM order of bid rows: 100, 99, 98  (descending)
```

**T5-8: Spread metrics display correctly**
```
GIVEN midPrice=100.75, spread=1.5, spreadBps=14.89, imbalance=1.18
THEN  these values appear in the SpreadBar component
```

**T5-9: Grouping selector changes increment in store**
```
GIVEN BTCUSD is focused (increments: 1, 5, 10, 50, 100, 500)
WHEN  user selects '50' from the GroupingSelector dropdown
THEN  store.groupingIncrement = 50
```

**T5-10: Grouping options adapt to symbol precision**
```
GIVEN focusedSymbol = 'XRPUSD'
THEN  GroupingSelector options = [0.0001, 0.001, 0.01, 0.1]
GIVEN focusedSymbol = 'BTCUSD'
THEN  GroupingSelector options = [1, 5, 10, 50, 100, 500]
```

**T5-11: Loading state during symbol transition**
```
GIVEN orderBook = null (cleared during transition)
THEN  a loading indicator is visible in the OrderBook panel
AND   no stale price levels are displayed
```

**T5-12: Flash class applied on size increase > 10%**
```
GIVEN a bid row at price=100.0
WHEN  store emits a flash event for 100.0 = 'increase'
THEN  that row gets the 'flash-green' class
WHEN  400 ms pass
THEN  the 'flash-green' class is removed
```

### Test Scenarios — Trades Feed Panel (Phase 5)

**T5-13: Trades display with correct side colours**
```
GIVEN trades = [{side:'buy'}, {side:'sell'}]
THEN  buy row has green colour class
      sell row has red colour class
```

**T5-14: Aggregated trade shows count badge**
```
GIVEN an aggregated trade with count=3
THEN  the row displays '(3)' or equivalent count indicator
```

**T5-15: Large trade receives highlighted styling**
```
GIVEN threshold = 10_000
      trade with price=5000, size=3.0  (notional=15_000)
THEN  the row has 'large-trade' CSS class
```

**T5-16: Jump to latest button appears when user scrolls up**
```
GIVEN TradesFeedPanel is rendered with 100 trades
WHEN  user scrolls up past the threshold
THEN  'Jump to latest' button becomes visible
```

**T5-17: Jump to latest button scrolls to bottom and hides**
```
GIVEN 'Jump to latest' button is visible
WHEN  user clicks it
THEN  list scrolls to the latest trade
AND   button disappears
```

**T5-18: Large trade threshold is user-configurable**
```
GIVEN threshold input shows 10000
WHEN  user types 50000 and presses Enter
THEN  trades below 50000 notional lose the 'large-trade' class
```

### Test Scenarios — ConnectionStatus (Phase 5)

**T5-19: Status indicator reflects WS state**
```
GIVEN wsStatus = 'connected'
THEN  indicator shows green dot + 'Connected'
GIVEN wsStatus = 'reconnecting'
THEN  indicator shows yellow dot + 'Reconnecting...'
GIVEN wsStatus = 'disconnected'
THEN  indicator shows red dot + 'Disconnected'
```

---

## Phase 6 — Integration Tests

Use MSW to mock the WebSocket server. Test full data flows end-to-end through the hook
layer into the store and out to the DOM.

### Test Scenarios (Phase 6)

**T6-1: Full ticker flow — WS message → DOM update**
```
GIVEN MSW sends a v2/ticker message for BTCUSD (price=65000, change=+2.1%)
WHEN  the app renders
THEN  the BTCUSD ticker cell shows '65,000.00' and '+2.10%' in green
```

**T6-2: Full order book flow — WS message → grouped DOM**
```
GIVEN focusedSymbol = ETHUSD, grouping = 1
      MSW sends l2_orderbook with 5 bid levels and 5 ask levels
WHEN  50 ms flush fires
THEN  5 bid rows and 5 ask rows appear in the DOM
      cumulative sizes are correct
```

**T6-3: Symbol switch clears and re-subscribes**
```
GIVEN BTCUSD order book is populated
WHEN  user clicks ETHUSD in the ticker bar
THEN  order book shows loading state immediately
AND   MSW receives unsubscribe for l2_orderbook:BTCUSD
AND   MSW receives subscribe   for l2_orderbook:ETHUSD
```

**T6-4: Reconnect restores all channels**
```
GIVEN app has subscribed to v2/ticker (×6), l2_orderbook:BTCUSD, all_trades:BTCUSD
WHEN  MSW closes the connection
THEN  wsStatus becomes 'reconnecting'
WHEN  MSW accepts a new connection
THEN  all 8 subscribe frames are re-sent
      wsStatus becomes 'connected'
```

**T6-5: Rolling stats update every 1 second**
```
GIVEN MSW sends 50 buy trades and 30 sell trades within 60 seconds
WHEN  1 second passes
THEN  stats bar shows approximately correct buy/sell volumes
```

---

## Phase 7 — E2E Smoke Tests (Playwright)

Run against the real backend (`ws://localhost:8080`).

### Scenarios (Phase 7)

**T7-1: App loads and shows all 6 tickers**
```
GIVEN backend is running
WHEN  page loads
THEN  all 6 ticker cells are visible
      at least 3 cells update their price within 5 seconds
```

**T7-2: Order book populates within 2 seconds of load**
```
GIVEN page loads with BTCUSD focused
WHEN  2 seconds pass
THEN  at least 5 ask rows and 5 bid rows are visible
      spread value is shown and positive
```

**T7-3: Focused symbol switch works end-to-end**
```
GIVEN BTCUSD is focused
WHEN  user clicks ETHUSD ticker
THEN  OrderBook panel heading changes to 'ETHUSD'
      trades feed updates to show ETHUSD trades
```

**T7-4: Symbol persists across page reload**
```
GIVEN user clicks SOLUSD
WHEN  page is reloaded
THEN  SOLUSD is still the focused symbol
```

**T7-5: App recovers from backend restart**
```
GIVEN app is running
WHEN  tester restarts the backend process
THEN  within 35 seconds, the connection status returns to 'Connected'
      ticker prices start updating again
```

---

## Phase Summary & Commit Cadence

| Phase | Commits | Tests added | Tests passing |
|-------|---------|-------------|---------------|
| 0 — Scaffold | 2 | T0-1, T0-2 | 2 |
| 1 — WS Manager | 4 | T1-1 … T1-8 | 10 |
| 2 — Pipelines | 6 | T2-1 … T2-20 | 30 |
| 3 — Store | 3 | T3-1 … T3-5 | 35 |
| 4 — Hooks | 4 | T4-1 … T4-4 | 39 |
| 5 — Components | 8 | T5-1 … T5-19 | 58 |
| 6 — Integration | 4 | T6-1 … T6-5 | 63 |
| 7 — E2E | 2 | T7-1 … T7-5 | 68 |
| Perf hardening | 2 | (manual profiling) | 68 |
| **Total** | **~35** | **68** | **68** |

---

## Coverage Targets

| Module | Line coverage |
|--------|--------------|
| `pipelines/` | 95%+ (pure functions, easy to cover) |
| `ws/WebSocketManager.ts` | 90%+ |
| `store/` | 90%+ |
| `hooks/` | 80%+ |
| `components/` | 75%+ |
| **Overall** | **80%+** |
