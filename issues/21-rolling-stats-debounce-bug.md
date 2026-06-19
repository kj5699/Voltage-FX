# Issue 21 — Fix RollingStatsBar: wrong null check + broken 1s debounce

**Type:** Bug / Must-fix
**Blocked by:** Nothing
**Priority:** High — visible broken feature during evaluation

---

## Problem

Two bugs in `src/components/TradesFeed/RollingStatsBar.tsx`.

### Bug 1 — wrong null check (line 12)

```tsx
setDisplayStats(useRollingStats === null ? null : liveStats)
```

`useRollingStats` is the imported hook function, not the current value. It is never `null`. The condition is always false — `displayStats` is always set to `liveStats`. The null-clearing path is dead code.

### Bug 2 — 1s debounce never fires

```tsx
useEffect(() => {
  const id = setInterval(() => {
    setDisplayStats(useRollingStats === null ? null : liveStats)
  }, 1000)
  return () => clearInterval(id)
}, [liveStats])   // <-- problem
```

`liveStats` comes from `useRollingStats()`, which updates every 100ms (trades flush). With `[liveStats]` as the dependency, the effect tears down and recreates the interval every 100ms. The 1-second timer resets before it can fire. The debounce is non-functional — the component effectively updates at 100ms cadence.

## Fix

Use a `useRef` to hold the latest live value. Run a single `setInterval` with empty deps that reads from the ref.

```tsx
export const RollingStatsBar = memo(function RollingStatsBar() {
  const liveStats = useRollingStats()
  const liveRef = useRef(liveStats)
  const [displayStats, setDisplayStats] = useState<RollingStats | null>(null)

  // Keep ref in sync without re-running the interval effect
  liveRef.current = liveStats

  useEffect(() => {
    const id = setInterval(() => {
      setDisplayStats(liveRef.current)
    }, 1000)
    return () => clearInterval(id)
  }, []) // empty deps — interval runs for component lifetime

  // ... rest unchanged
})
```

## Acceptance criteria

- [ ] Rolling stats bar updates visually at ~1s cadence (not 100ms)
- [ ] `displayStats` correctly becomes `null` when `liveStats` is `null` (symbol switch)
- [ ] No interval teardown/recreate on every trades flush (verify with React DevTools Profiler — RollingStatsBar should show 1 render/s not 10)

## Files

- `src/components/TradesFeed/RollingStatsBar.tsx`
