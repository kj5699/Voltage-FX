# CLAUDE.md — Real-Time Trading Dashboard

## What this project is

A React + TypeScript trading dashboard that consumes a stress-test WebSocket backend pushing crypto market data at aggressive rates. Evaluation focuses on render isolation, performance under load, and order book correctness — not visual design.

Backend: `ws://localhost:8080` | Config API: `http://localhost:3000/intervals`

## Critical backend protocol facts

Read these before touching any data-handling code. Getting these wrong causes silent failures.

| Fact | What it means in code |
|------|----------------------|
| Orderbook `bids`/`asks` are `[price, size][]` tuples | Destructure: `const [price, size] = level` — never `.price`/`.size` |
| Tuple values are **strings**, not numbers | `parseFloat(price)` and `parseFloat(size)` — the wire sends `["62560.9","3.7315"]` |
| All timestamps are **microseconds** | Divide by 1000 before any ms arithmetic. Bucket math: `Math.floor(timestampMs / 100)` |
| Trades have no `side` field | Derive: `buyer_role === 'taker'` → `'buy'`, `seller_role === 'taker'` → `'sell'` |
| `ltp_change_24h` is a **string** multiplier | `parseFloat(ltp_change_24h)` then `(val - 1) * 100` gives percentage. Last price = `close` field (number). |
| Top-level `type` field, not `channel` | Messages use `msg.type` for routing: `'l2_orderbook'`, `'all_trades'`, `'v2/ticker'` |

## Symbol precision (must match backend config.js exactly)

| Symbol | Precision | Notes |
|--------|-----------|-------|
| BTCUSD | 1dp | |
| ETHUSD | 2dp | |
| XRPUSD | 4dp | |
| SOLUSD | **4dp** | Common mistake: not 2dp |
| PAXGUSD | 2dp | |
| DOGEUSD | **6dp** | Common mistake: not 4dp |

## Architecture decisions (do not reverse without strong reason)

**State: Zustand with atomic selectors.** Each component subscribes to exactly one selector. Never subscribe to the whole store. This is what makes render isolation possible.

**Updates: buffer-flush pattern.** Raw WS messages push into `useRef` arrays. Intervals drain and write to store:
- Tickers: 200ms flush
- Order book: 50ms flush
- Trades: 100ms flush

Never call `zustand.setState` directly from a WebSocket message handler.

**Order book grouping: integer-scaled arithmetic.** Multiply prices by `10^precision`, use integer floor/ceil, divide back. Never use `toFixed` for grouping boundaries.

**Trade list: react-window FixedSizeList.** Never replace with a plain `<ul>`. DOM node count must stay ≈15 regardless of feed length.

**WebSocket: singleton class.** One `WebSocketManager` instance for the app lifetime. Never open a second connection.

## The 10-step focus-switch sequence

When the user clicks a different symbol, this executes synchronously in one event-loop tick:

1. `focusSeqId++` ← **first** — invalidates in-flight flushes
2. Unsubscribe `l2_orderbook` for old symbol
3. Unsubscribe `all_trades` for old symbol
4. `setState({ orderBook: null, trades: [], rollingStats: null })`
5. Clear `orderBookBuffer.current`
6. Clear `tradesBuffer.current`
7. Reset `groupingIncrement` to `SYMBOL_CONFIG[newSymbol].increments[0]`
8. Set `focusedSymbol` + persist to `localStorage`
9. Subscribe `l2_orderbook` for new symbol
10. Subscribe `all_trades` for new symbol

The `focusSeqId` guard: flush handlers capture the seqId at subscription time. At flush time, if `capturedSeqId !== store.focusSeqId`, discard the flush.

## Render isolation rule (evaluated heavily)

A BTCUSD ticker update must not re-render ETHUSD's cell or either panel. Verify with React DevTools Profiler. If you see cross-panel renders, check:
1. Is the component subscribing to a slice larger than it needs?
2. Is the selector returning a new object reference when the data hasn't changed?

## Performance budget per flush cycle

| Operation | Limit |
|-----------|-------|
| Ticker flush | < 2ms |
| Order book aggregation | < 2ms |
| Trade aggregation + rolling stats | < 3ms |
| React render per panel | < 5ms |
| **Total per 50ms frame** | **< 13ms** |

Measure with `performance.now()` marks inside flush handlers.

## Full documentation

- `docs/01-PRD.md` — Problem, solution, 42 user stories, implementation decisions
- `docs/02-GOALS.md` — Functional and non-functional goals with measurable thresholds
- `docs/03-APPROACHES.md` — Every approach considered, tradeoffs, final choices
- `docs/04-ARCHITECTURE.md` — System design, pipelines, data flow, scaling analysis
- `docs/05-TDD-PLAN.md` — 68 test scenarios across 7 phases
- `issues/` — 19 independently-grabbable implementation issues in execution order
