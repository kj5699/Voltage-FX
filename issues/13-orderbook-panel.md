# Issue 13 — Order Book Panel: Display, Grouping Selector, Spread Metrics

**Type:** AFK
**Blocked by:** Issues 06, 11

---

## What to build

Implement the order book panel — asks above, bids below, with spread metrics between them and a grouping increment selector.

Includes:
- `useOrderBook` hook: subscribes to `l2_orderbook` for focused symbol, accumulates snapshots in a `useRef` buffer, flushes every 50ms, runs `aggregateOrderBook` with current `groupingIncrement`, writes `ProcessedOrderBook` to store. Keeps `prevSizeMap` in a ref for flash detection (Issue 14). Captures `focusSeqId` at subscription time and discards flushes where captured seq ≠ current seq.
- `OrderBookPanel` component: reads from `useOrderBook()` selector. Shows loading skeleton when `orderBook === null`.
- `AskTable`: renders asks in ascending price order (lowest first — closest to mid at bottom)
- `BidTable`: renders bids in descending price order (highest first — closest to mid at top)
- `SpreadBar`: shows mid-price, absolute spread, spread bps, imbalance label (bid heavy / ask heavy / balanced)
- `GroupingSelector`: dropdown populated from `SYMBOL_CONFIG[focusedSymbol].increments`. On change: calls `setGroupingIncrement`. Resets to index 0 when focused symbol changes.

Each row shows: price, size, cumulative size, depth bar (CSS `width` proportional to `depthWidth`).

## Acceptance criteria

- [ ] Asks rendered in ascending price order (lowest price first, closest to spread) (T5-6)
- [ ] Bids rendered in descending price order (highest price first, closest to spread) (T5-7)
- [ ] Spread metrics displayed correctly: mid-price, spread, spread bps, imbalance (T5-8)
- [ ] Grouping selector shows correct options for each symbol (T5-10: XRPUSD ≠ BTCUSD options)
- [ ] Selecting increment 50 calls `setGroupingIncrement(50)` (T5-9)
- [ ] Loading skeleton shown when `orderBook === null` — no stale price levels visible (T5-11)
- [ ] Depth bars scale to 100% at deepest cumulative level per side
- [ ] Stale snapshot from previous symbol discarded (seqId guard — T4-2c)
- [ ] Grouping resets to finest increment on symbol change (T4-2b)
- [ ] **Render isolation**: an orderbook update does not re-render `TickerBar` or `TradesFeedPanel`
- [ ] Flush runs within 2ms budget for 500-level snapshot (benchmark test)

## Testing scope

Tests T5-6 through T5-11, T4-2b, T4-2c from `docs/05-TDD-PLAN.md`.
Integration test T6-2: MSW sends `l2_orderbook` → 5 bid rows and 5 ask rows appear in DOM with correct cumulative sizes.
Integration test T6-3 (partial): symbol switch clears orderbook and triggers new subscription.
