# CLAUDE.md — src/store/

## What lives here

The Zustand store definition and typed selector hooks. This is the only place components read server state.

## Store slices

```
wsStatus:          'connecting' | 'connected' | 'reconnecting' | 'disconnected'
focusedSymbol:     Symbol
focusSeqId:        number        ← generation counter, not display state
tickers:           Partial<Record<Symbol, ParsedTicker>>
orderBook:         ProcessedOrderBook | null
groupingIncrement: number
trades:            AggregatedTrade[]   ← capped at 500
rollingStats:      RollingStats | null
```

## focusSeqId — the stale-snapshot guard

Increment `focusSeqId` **first** when the focused symbol changes — before unsubscribing, before clearing state. Flush handlers capture this value at subscription time. If `capturedSeqId !== store.focusSeqId` at flush time, they discard the flush.

Never use `focusSeqId` for display. It's a concurrency guard only.

## setFocusedSymbol must do 4 things atomically

1. Increment `focusSeqId`
2. Update `focusedSymbol`
3. Reset `groupingIncrement` to `SYMBOL_CONFIG[newSymbol].increments[0]`
4. Write `newSymbol` to `localStorage`

Do all four in a single `set()` call.

## localStorage

- Init: `focusedSymbol = localStorage.getItem('focusedSymbol') ?? 'BTCUSD'`
- Validate: if stored value is not a valid Symbol, fall back to `'BTCUSD'`
- Write: on every `setFocusedSymbol` call

## updateTickers — merge, never replace

```ts
updateTickers: (batch) => set(state => ({
  tickers: { ...state.tickers, ...batch }
}))
```

Updating `BTCUSD` must not change `ETHUSD`'s object reference. This is what prevents ETHUSD from re-rendering.

## Selector hooks (one per component type)

```
useWsStatus()          → AppStore['wsStatus']
useFocusedSymbol()     → AppStore['focusedSymbol']
useTicker(symbol)      → AppStore['tickers'][symbol]
useOrderBook()         → AppStore['orderBook']
useGroupingIncrement() → AppStore['groupingIncrement']
useTrades()            → AppStore['trades']
useRollingStats()      → AppStore['rollingStats']
useFocusSeqId()        → AppStore['focusSeqId']
```

Each hook must have an explicit return type. No `any`.

## What NOT to put in the store

- Raw unparsed WS messages (parsers handle those)
- Derived values that can be computed in the pipeline (e.g. don't store mid-price separately — it comes from the pipeline)
- Flash state (handled via DOM class toggle in components)
- Auto-scroll lock (local component state)
- Large-trade threshold (local to useTrades hook)
