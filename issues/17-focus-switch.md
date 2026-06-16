# Issue 17 — Focus Switch: Atomic 10-Step Sequence, SeqId Guard, Grouping Reset

**Type:** AFK
**Blocked by:** Issues 12, 13, 15

---

## What to build

Implement the complete focus-switch flow that executes atomically when the user clicks a different ticker cell. All 10 steps run synchronously in a single event-loop tick — no async gaps where stale data can bleed through.

The 10-step sequence (from architecture doc):
```
1.  focusSeqId++                         ← FIRST — invalidates in-flight flushes
2.  wsManager.unsubscribe('l2_orderbook', oldSymbol)
3.  wsManager.unsubscribe('all_trades',   oldSymbol)
4.  setState({ orderBook: null, trades: [], rollingStats: null })
5.  orderBookBuffer.current = []
6.  tradesBuffer.current    = []
7.  groupingIncrement = SYMBOL_CONFIG[newSymbol].increments[0]
8.  focusedSymbol = newSymbol  → localStorage
9.  wsManager.subscribe('l2_orderbook', newSymbol, handler)
10. wsManager.subscribe('all_trades',   newSymbol, handler)
```

**SeqId guard:** Each flush handler captures `focusSeqId` at the time the subscription was created (`capturedSeqId = store.focusSeqId`). At flush time, if `capturedSeqId !== store.focusSeqId`, the flush is discarded — the subscription is stale.

This is wired in `useOrderBook` and `useTrades` hooks. When the hooks re-mount for a new symbol, they capture the current `focusSeqId`.

**Rapid switching:** If the user clicks 3 symbols quickly (A → B → C), only C's subscriptions are active. The seqId guard ensures any in-flight flush for A or B is discarded.

## Acceptance criteria

- [ ] Switching from BTCUSD → ETHUSD: order book immediately shows null (loading state) (T4-2)
- [ ] Switching: `wsManager` receives unsubscribe for old symbol before subscribe for new (T4-1)
- [ ] Grouping increment resets to finest for new symbol (T4-2b)
- [ ] Stale flush from old symbol is discarded (capturedSeqId mismatch) (T4-2c)
- [ ] Rapid A→B→C switching: only C's data appears; no B data visible (rapid-switch test)
- [ ] Old buffers are empty before new subscriptions fire (`orderBookBuffer.current === []`)
- [ ] `trades` array in store is `[]` immediately after switch (no stale trades)
- [ ] `rollingStats` in store is `null` immediately after switch
- [ ] New symbol's first snapshot populates the order book within one flush interval (50ms)

## Testing scope

Tests T4-1, T4-2, T4-2b, T4-2c from `docs/05-TDD-PLAN.md`.
Integration test T6-3: MSW verifies unsubscribe + subscribe frame order on symbol switch.
Additional: rapid-switch test (3 clicks < 100ms apart → only last symbol's data shown).
