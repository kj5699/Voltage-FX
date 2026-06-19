# Issue 24 — Re-run benchmark against current Worker architecture

**Type:** Documentation / Should-fix
**Blocked by:** Issue 20 (already done — Worker exists at HEAD)
**Priority:** Medium — benchmark log currently misrepresents the current architecture

---

## Problem

All entries in `benchmark-results.log` were generated at commit `117e956`
(feat: backend control panel). The Web Worker was introduced in commit `84ed56c`
(feat: issue 20 — Web Worker for pipeline aggregation).

The existing log measures main-thread JSON.parse cost:

```
OB JSON.parse only    97     0.926ms mean    2.039ms p95
```

This cost no longer exists on the main thread — `JSON.parse` now runs in the Worker.
The benchmark is technically accurate for a past commit but misleading for the current
architecture. An evaluator reading the log and the architecture doc together will see a
discrepancy.

Additionally, the benchmark script at `scripts/run-benchmark.test.ts` measures the
pipelines inline (simulating pre-Worker behaviour). It should be updated to reflect
the Worker boundary so it measures what actually happens at runtime.

## What to do

### Step 1 — Run `npm run bench` at HEAD

```bash
npm run bench 2>&1 | tee -a benchmark-results.log
```

The new run should show:
- `OB JSON.parse` no longer appears (or is noted as "now runs in Worker")
- `OB aggregate` numbers similar to before (aggregation still runs in Worker, so these
  are Worker-side costs, not main-thread costs — worth noting in the header)
- Main-thread cost per second is effectively only store writes + React renders

### Step 2 — Add a header to the new run

The benchmark header should note:

```
Commit    : 84ed56c
Worker    : YES — JSON.parse + aggregation run in pipelineWorker.ts
Main-thread pipeline cost : ~0ms (Worker handles all CPU work)
```

### Step 3 — Update architecture doc reference

In `docs/04-ARCHITECTURE.md §13`, the claim:

> "What is not solved: at stress rates, JSON.parse of 500-level snapshots (~50KB each)
> consumes 200–300ms/s of main thread time"

Should be updated to past tense — this was solved by Issue 20.

## Acceptance criteria

- [ ] `benchmark-results.log` contains at least one run at commit `84ed56c` or later
- [ ] The run header notes that the Worker is active
- [ ] `docs/04-ARCHITECTURE.md §13` reflects that JSON.parse is now off the main thread
- [ ] `npm run bench` exits 0

## Files

- `benchmark-results.log`
- `docs/04-ARCHITECTURE.md`
- `scripts/run-benchmark.test.ts` (if benchmark logic needs updating to reflect Worker split)
