# Issue 10 — Ticker Pipeline (Latest-Value Merge)

**Type:** AFK
**Blocked by:** Issue 05

---

## What to build

Implement `mergeLatestTickers` — a pure function that takes a buffer of parsed ticker messages (potentially many per symbol) and returns only the most recent value per symbol.

```
mergeLatestTickers(
  buffer: ParsedTicker[]
): Partial<Record<Symbol, ParsedTicker>>
```

Logic: iterate the buffer in order; later entries overwrite earlier entries for the same symbol. A buffer with 50 BTCUSD messages and 30 ETHUSD messages produces exactly 2 entries in the output.

This is deliberately the simplest pipeline — the ticker bar only ever cares about the latest price, not history.

## Acceptance criteria

- [ ] Multiple messages for same symbol → only latest value in output (T2-20)
- [ ] Multiple symbols in buffer → one entry per symbol in output
- [ ] Empty buffer → empty output object
- [ ] Output contains only symbols that appeared in the buffer (no phantom entries)
- [ ] Function is pure — does not mutate the input buffer

## Testing scope

Test T2-20 from `docs/05-TDD-PLAN.md` plus empty-buffer test.
