# CLAUDE.md — src/components/

## The one rule that overrides everything else

**Zero cross-panel re-renders.**

A BTCUSD ticker update must not re-render ETHUSD's cell, `OrderBookPanel`, or `TradesFeedPanel`. An orderbook flush must not re-render `TradesFeedPanel` or any `TickerCell`. Verify with React DevTools Profiler after every change to a component that reads from the store.

If you see unexpected re-renders:
1. Is the selector returning more data than the component needs?
2. Is the selector creating a new object/array reference when the value hasn't changed?

## Selector rule

Each component subscribes to **exactly one** Zustand selector that returns exactly what it needs:

| Component | Selector |
|-----------|---------|
| `TickerCell` | `state => state.tickers[symbol]` (one per symbol) |
| `OrderBookPanel` | `state => state.orderBook` |
| `TradesFeedPanel` | `state => state.trades` |
| `RollingStatsBar` | `state => state.rollingStats` |
| `ConnectionStatus` | `state => state.wsStatus` |
| `GroupingSelector` | `state => state.groupingIncrement` |

Never subscribe to `state` or `state.tickers` (the whole map) in a TickerCell.

## Flash highlights — DOM only, not React state

Flash events must not trigger a React re-render of `OrderBookPanel`. Apply the CSS class directly to the row DOM node via a `ref`, then `setTimeout(removeClass, 400)`. If React state is used for flash, the whole table re-renders 20 times/second under stress.

## VirtualTradeList — never replace react-window

`FixedSizeList` from `react-window` keeps DOM node count at ≈15 regardless of feed length. Never replace with a plain `<ul>` or `<div>` with mapped children — at 500 trades and 10 updates/s the DOM becomes unusable.

Auto-scroll: `listRef.scrollToItem(trades.length - 1, 'end')`. Do not use `scrollIntoView` or manipulate `scrollTop` directly.

## Loading state

`OrderBookPanel` must show a skeleton when `orderBook === null`. Never render stale price levels. The order book is set to `null` at step 4 of the focus-switch sequence — before new data arrives. The panel must handle `null` gracefully.

## Component breakdown

```
TickerBar/
  TickerBar.tsx          — renders 6 TickerCell children, no store access
  TickerCell.tsx         — subscribes to useTicker(symbol), handles click → setFocusedSymbol

OrderBook/
  OrderBookPanel.tsx     — subscribes to useOrderBook(), handles null (skeleton)
  AskTable.tsx           — renders asks ascending (lowest first)
  BidTable.tsx           — renders bids descending (highest first)
  SpreadBar.tsx          — mid-price, spread, bps, imbalance
  GroupingSelector.tsx   — dropdown from SYMBOL_CONFIG[focusedSymbol].increments

TradesFeed/
  TradesFeedPanel.tsx    — outer shell, layout
  RollingStatsBar.tsx    — 1s setInterval to read rollingStats (not re-rendered on every flush)
  VirtualTradeList.tsx   — react-window FixedSizeList, manages auto-scroll lock
  JumpToLatestButton.tsx — overlay button, visible when !isAutoScrollLocked
```

## What belongs in local state (not Zustand)

- `isAutoScrollLocked` — `VirtualTradeList` local state, reset to `true` on symbol change
- `notionalThreshold` — `TradesFeedPanel` local state, passed to `useTrades` hook
- Flash timeout IDs — `useRef` in the row component or managed via the flush handler
