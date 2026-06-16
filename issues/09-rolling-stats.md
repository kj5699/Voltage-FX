# Issue 09 — Rolling Stats Deque (60s Window)

**Type:** AFK
**Blocked by:** Issue 08

---

## What to build

Implement `updateRollingDeque` and `computeRollingStats` — pure functions that maintain a time-ordered deque of raw trades for the last 60 seconds and compute aggregate statistics from it.

```
updateRollingDeque(
  deque: ParsedTrade[],
  newTrades: ParsedTrade[],
  nowMs: number
): ParsedTrade[]   // returns new deque (evicted old, appended new)

computeRollingStats(deque: ParsedTrade[]): RollingStats
```

Eviction: drop entries from the front of the deque where `trade.timestampMs < nowMs - 60_000`.

```
RollingStats = {
  buyVolume: number
  sellVolume: number
  tradeCount: number
  avgTradeSize: number
}
```

`avgTradeSize = (buyVolume + sellVolume) / tradeCount` — returns 0 if `tradeCount === 0` (not NaN).

The `RollingStatsBar` component (Issue 16) reads stats from the store via its own `setInterval(1000)`, not from the 100ms flush directly. This prevents 10 re-renders/s for a display that updates at 1/s.

## Acceptance criteria

- [ ] Trades older than 60s are excluded from stats (T2-18)
- [ ] Trades within the 60s window are included correctly
- [ ] `buyVolume` and `sellVolume` correctly split by `side`
- [ ] `tradeCount` matches number of entries in window
- [ ] `avgTradeSize` = 0 (not NaN) when deque is empty (T2-19 edge case)
- [ ] `avgTradeSize` calculated correctly for non-empty deque
- [ ] Deque is not mutated — returns a new array
- [ ] Eviction removes only entries older than cutoff; entries exactly at cutoff are kept

## Testing scope

Tests T2-18 and T2-19 from `docs/05-TDD-PLAN.md` plus empty-deque edge case and exact-cutoff boundary test.
