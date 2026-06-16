# Issue 11 — Zustand Store + Atomic Selectors

**Type:** AFK
**Blocked by:** Issues 04, 05

---

## What to build

Implement the Zustand store and all typed selector hooks. This is the integration point between pipelines and components — nothing else.

Store schema (from architecture doc):
```
AppStore = {
  wsStatus:          'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  focusedSymbol:     Symbol
  focusSeqId:        number          // generation counter — increment FIRST on symbol switch
  tickers:           Partial<Record<Symbol, ParsedTicker>>
  orderBook:         ProcessedOrderBook | null
  groupingIncrement: number
  trades:            AggregatedTrade[]
  rollingStats:      RollingStats | null

  // actions
  setWsStatus:          (s) => void
  setFocusedSymbol:     (s: Symbol) => void   // persists to localStorage + increments focusSeqId
  updateTickers:        (batch) => void        // merges, does not replace
  setOrderBook:         (ob) => void
  setGroupingIncrement: (n) => void
  setTrades:            (t, stats) => void     // enforces 500-entry cap
}
```

`focusedSymbol` init: read from `localStorage.getItem('focusedSymbol')` — fall back to `'BTCUSD'` if absent or invalid.

`setFocusedSymbol` must:
1. Increment `focusSeqId`
2. Update `focusedSymbol`
3. Reset `groupingIncrement` to `SYMBOL_CONFIG[newSymbol].increments[0]`
4. Write to `localStorage`

Selector hooks to export (one per subscribing component):
```
useWsStatus()         → wsStatus
useFocusedSymbol()    → focusedSymbol
useTicker(symbol)     → tickers[symbol]
useOrderBook()        → orderBook
useGroupingIncrement()→ groupingIncrement
useTrades()           → trades
useRollingStats()     → rollingStats
useFocusSeqId()       → focusSeqId
```

Each selector must be typed — no `any`.

## Acceptance criteria

- [ ] Initial `focusedSymbol` restored from `localStorage` if valid symbol present (T3-4)
- [ ] Initial `focusedSymbol` defaults to `'BTCUSD'` when `localStorage` is empty
- [ ] `updateTickers({ BTCUSD: x })` does not change `tickers.ETHUSD` reference (T3-2)
- [ ] `setFocusedSymbol('ETHUSD')` writes `'ETHUSD'` to `localStorage` (T3-3)
- [ ] `setFocusedSymbol` increments `focusSeqId` before updating symbol
- [ ] `setFocusedSymbol` resets `groupingIncrement` to finest increment for new symbol
- [ ] `setTrades` with 600 entries caps output at 500 (T3-5)
- [ ] `useTicker('BTCUSD')` re-renders its subscriber only when `tickers.BTCUSD` changes — not when `tickers.ETHUSD` changes (render isolation — verify with render counter in test)
- [ ] All selector hooks have explicit TypeScript return types

## Testing scope

Tests T3-1 through T3-5 from `docs/05-TDD-PLAN.md` plus render isolation test for `useTicker`.
