# Issue 08 — Trade Aggregation Pipeline

**Type:** AFK
**Blocked by:** Issue 05

---

## What to build

Implement `aggregateTrades` — a pure function that merges raw parsed trades into display rows using a 100ms sliding window, flags large trades, and caps the output array.

```
aggregateTrades(
  rawTrades: ParsedTrade[],
  existingTrades: AggregatedTrade[],
  notionalThreshold: number,
  bucketMs?: number   // default 100
): AggregatedTrade[]
```

Bucket key: `"${price}:${Math.floor(timestampMs / 100)}"` — trades at same price within same 100ms bucket merge.

Merged row shows: `time` (earliest in bucket), `price`, `side`, `size` (sum), `count` (number of trades), `isLarge` (`price * size > notionalThreshold`).

Output array is prepended (newest first) to `existingTrades` and capped at `MAX_TRADES = 500`.

`AggregatedTrade` type:
```
{
  id: string             // bucket key — stable React key
  time: number           // timestampMs of first trade in bucket
  price: number
  side: 'buy' | 'sell'
  size: number           // sum
  count: number          // number of raw trades merged
  isLarge: boolean
}
```

## Acceptance criteria

- [ ] Two trades at same price within 100ms merge into one row with combined size and count=2 (T2-13)
- [ ] Two trades at same price in different 100ms buckets produce two separate rows (T2-14)
- [ ] Two trades in same bucket at different prices produce two separate rows (T2-15)
- [ ] Trade with notional > threshold has `isLarge: true` (T2-16)
- [ ] Trade with notional exactly equal to threshold has `isLarge: false` (boundary — exclusive)
- [ ] Output array capped at MAX_TRADES=500; oldest entries evicted (T2-17)
- [ ] Empty input returns existing trades unchanged
- [ ] All bucket math uses `timestampMs` (milliseconds) — not raw microsecond timestamps

## Testing scope

Tests T2-13 through T2-17 from `docs/05-TDD-PLAN.md` plus boundary test (notional = threshold exactly) and empty-input test.
