# Issue 02 — Frontend Scaffold + Tooling + Root CLAUDE.md

**Type:** AFK
**Blocked by:** None — can start in parallel with Issue 01

---

## What to build

Bootstrap the React + TypeScript project with all tooling configured and a passing baseline test suite. Zero application logic. A developer (or agent) picking up any subsequent issue should be able to clone, `npm install`, and have lint + tests passing immediately.

## What to build

- Vite project with React 18 + TypeScript in strict mode
- Dependencies installed: `zustand`, `react-window`, `@types/react-window`, `tailwindcss`
- Dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `msw`, `vitest-websocket-mock`, `playwright`
- `vitest.config.ts` — jsdom environment, coverage thresholds (overall ≥80%, `src/pipelines/**` ≥95%)
- `tsconfig.json` — `strict: true`, `noUncheckedIndexedAccess: true`, path aliases (`@ws`, `@store`, `@pipelines`, `@hooks`, `@components`, `@config`, `@utils`)
- ESLint with `@typescript-eslint`, `no-explicit-any` rule as error
- Tailwind configured with a dark trading theme (dark background, neutral greys)
- Directory skeleton created (empty `index.ts` per folder): `src/ws/`, `src/store/`, `src/pipelines/`, `src/hooks/`, `src/components/TickerBar/`, `src/components/OrderBook/`, `src/components/TradesFeed/`, `src/config/`, `src/utils/`
- One placeholder test that passes (`npm test` exits 0)
- Root `CLAUDE.md` written (see below)

## Root CLAUDE.md content

The root CLAUDE.md must cover:
- Project purpose (stress-test trading dashboard, evaluation assignment)
- Tech stack decisions and why (Zustand over Redux, react-window, buffer-flush pattern)
- The four critical backend protocol facts: tuple format, microsecond timestamps, no `side` field, `ltp_change_24h` is a multiplier
- Symbol precision table (SOLUSD=4dp, DOGEUSD=6dp — common mistake)
- The 10-step focus-switch sequence (with `focusSeqId` guard)
- Render isolation rule: zero cross-panel re-renders — verify with React DevTools Profiler
- Performance budget per flush (ticker <2ms, orderbook <2ms, trades <3ms, render <5ms)
- Link to `docs/` directory for full architecture and TDD plan

## Acceptance criteria

- [ ] `npm install` completes with no peer-dependency errors
- [ ] `npm run dev` starts Vite dev server at `localhost:5173` and loads a blank page without console errors
- [ ] `npm run build` exits 0 with no TypeScript errors
- [ ] `npm test` exits 0 (placeholder test passes)
- [ ] `npm run lint` exits 0
- [ ] All path aliases resolve correctly (write a trivial import test)
- [ ] Coverage report generates (even at 0% — infrastructure must work)
- [ ] `CLAUDE.md` present at repo root covering all items listed above
- [ ] Directory skeleton matches `docs/04-ARCHITECTURE.md` module layout exactly

## Testing scope

- Build pipeline test (T0-1): `npm run build` exits 0
- Test runner smoke test (T0-2): placeholder test passes
