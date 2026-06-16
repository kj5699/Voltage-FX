# Issue 19 — Performance Verification: Profiler, Heap Snapshot, Stress Test

**Type:** HITL
**Blocked by:** All previous issues

---

## What to verify

Run a structured performance audit against the running app with the backend cranked to stress rates. This is a manual verification issue — no code changes expected. If problems are found, file targeted fix issues.

## Step-by-step verification checklist

### 1. Render Isolation (React DevTools Profiler)

- [ ] Open React DevTools → Profiler → Record
- [ ] Let the app run for 10 seconds at default backend rates
- [ ] Stop recording. Inspect the flame graph.
- [ ] Confirm: `TickerCell[ETHUSD]` render count does NOT increase when only BTCUSD updates
- [ ] Confirm: `OrderBookPanel` render count does NOT increase during ticker-only flush intervals
- [ ] Confirm: `TradesFeedPanel` render count does NOT increase during orderbook-only flush intervals
- [ ] Record and screenshot the profiler output for the architecture doc

### 2. Performance Under Default Load

- [ ] Open Chrome DevTools → Performance → Record for 10 seconds
- [ ] Confirm: frame rate ≥ 50 FPS (green bar in timeline, no red jank frames)
- [ ] Confirm: no long tasks > 50ms in the main thread
- [ ] Confirm: each flush cycle visible as a task ≤ 13ms

### 3. Stress Test (backend cranked)

Run:
```bash
curl -X POST http://localhost:3000/intervals \
  -H "Content-Type: application/json" \
  -d '{"all_trades": {"min": 1, "max": 5}, "l2_orderbook": {"min": 10, "max": 20}}'
```

- [ ] App remains responsive (clicks register within 100ms)
- [ ] No browser tab freeze or "Page Unresponsive" dialog
- [ ] Ticker bar continues updating
- [ ] Order book continues rendering (may skip frames — acceptable)
- [ ] Trades feed scrolls smoothly (react-window node count stays ≈15)
- [ ] Record Chrome Performance trace under stress — screenshot for docs

### 4. Memory Stability

- [ ] Open Chrome DevTools → Memory
- [ ] Take heap snapshot at T=0
- [ ] Run app at stress rate for 5 minutes
- [ ] Take heap snapshot at T=5min
- [ ] Compare: heap growth < 5MB (flat profile)
- [ ] Confirm no detached DOM nodes growing in the snapshot

### 5. Recovery After Stress

- [ ] Reset backend to default rates:
```bash
curl -X POST http://localhost:3000/intervals \
  -d '{"all_trades": {"min": 5, "max": 20}, "l2_orderbook": {"min": 10, "max": 40}}'
```
- [ ] Confirm app returns to normal render cadence within 2 seconds
- [ ] No frozen panels, no stale data

## Deliverables

- Screenshots of Profiler flame graph (render isolation confirmed)
- Screenshot of Performance trace under stress (FPS visible)
- Heap snapshot comparison (T=0 vs T=5min)
- Any bugs found → filed as new issues with "perf" label

## Testing scope

Manual only. Results documented in `docs/KNOWN-ISSUES.md`.
