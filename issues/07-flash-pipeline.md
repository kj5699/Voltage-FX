# Issue 07 — Flash Highlight Detection Pipeline

**Type:** AFK
**Blocked by:** Issue 06

---

## What to build

Implement `detectFlashes` — a pure function that diffs the previous aggregated size map against the new one and returns which price levels changed by more than 10%.

```
detectFlashes(
  prev: Map<number, number>,   // groupedPrice → size from last flush
  next: Map<number, number>    // groupedPrice → size from this flush
): Map<number, 'increase' | 'decrease'>
```

Logic: for each price in `next`, if `prev` has a value for that price and `|next - prev| / prev > 0.10`, emit a flash direction. New levels (not in `prev`) do not flash. Deleted levels (not in `next`) do not flash.

The `aggregateOrderBook` function (Issue 06) must be updated to also return the raw `Map<groupedPriceInt, size>` so `detectFlashes` can compare across flushes. The flush handler in `useOrderBook` (Issue — hooks phase) keeps `prevSizeMap` in a `useRef` between flushes.

## Acceptance criteria

- [ ] Size increase > 10% returns `'increase'` for that price (T2-10)
- [ ] Size decrease > 10% returns `'decrease'` for that price (T2-11)
- [ ] Change ≤ 10% returns no entry for that price (T2-12)
- [ ] New level not in `prev` produces no flash
- [ ] Level present in `prev` but absent in `next` produces no flash
- [ ] Empty `prev` map produces no flashes (first flush, no previous state)
- [ ] Function is pure — does not mutate inputs

## Testing scope

Tests T2-10, T2-11, T2-12 from `docs/05-TDD-PLAN.md` plus the three additional edge cases listed in acceptance criteria.
