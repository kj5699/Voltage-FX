# Issue 06 — Order Book Aggregation Pipeline

**Type:** AFK
**Blocked by:** Issue 05

---

## What to build

Implement the `aggregateOrderBook` pure function. Takes parsed `bids` and `asks` arrays plus a grouping increment and symbol, returns a `ProcessedOrderBook` ready for the store. This is the core financial computation in the app.

Pipeline steps (must run in this order):
1. Scale prices to integers using symbol precision to avoid float rounding in bucket math
2. Group bids (floor) and asks (ceil) into `Map<groupedPriceInt, accumulatedSize>`
3. Sort bids descending, asks ascending
4. Compute prefix-sum cumulative sizes
5. Scale depth bars — each side independently scaled to its own max cumulative (bid max ≠ ask max)
6. Compute spread metrics: mid-price, absolute spread, spread in basis points, imbalance

Integer scaling formula (from architecture doc — encodes precision of the approach):
```
price_int = Math.round(price * 10^precision)
incr_int  = Math.round(increment * 10^precision)
bid_group = Math.floor(price_int / incr_int) * incr_int
ask_group = Math.ceil (price_int / incr_int) * incr_int
```

Symbol precision config (must match backend exactly):
```
BTCUSD=1, ETHUSD=2, XRPUSD=4, SOLUSD=4, PAXGUSD=2, DOGEUSD=6
```

Output type:
```
ProcessedOrderBook = {
  bids: ProcessedLevel[]
  asks: ProcessedLevel[]
  midPrice: number | null
  spread: number | null
  spreadBps: number | null
  imbalance: number | null
}
ProcessedLevel = { price: number; size: number; cumulativeSize: number; depthWidth: number }
```

Also implement `SYMBOL_CONFIG` in `src/config/symbols.ts` with precision and increment arrays per symbol.

## Acceptance criteria

- [ ] Basic aggregation at increment=1 produces correct sorted output (T2-1)
- [ ] Sizes aggregate correctly across grouped levels (T2-2)
- [ ] Ask ceil grouping never produces an ask price ≤ any bid price (T2-3)
- [ ] Cumulative sizes are correct prefix sums (T2-4)
- [ ] Depth bar widths scale to 100 at the deepest level of each side (T2-5)
- [ ] Spread metrics correct: mid-price, absolute spread, bps (T2-6, T2-7)
- [ ] XRPUSD 4dp grouping produces correct bucket boundaries (T2-8)
- [ ] SOLUSD 4dp grouping correct (T2-8b) — **not 2dp**
- [ ] DOGEUSD 6dp grouping correct (T2-8c) — **not 4dp**
- [ ] Empty bids or asks → `midPrice/spread/imbalance = null`, no crash (T2-9)
- [ ] Benchmark: `aggregateOrderBook` with N=200 levels completes in < 2ms (measured with `performance.now()`)
- [ ] No `any` in function signatures

## Testing scope

Tests T2-1 through T2-9 (including T2-8b, T2-8c) from `docs/05-TDD-PLAN.md`.
Benchmark test asserts < 2ms for N=200 levels.
