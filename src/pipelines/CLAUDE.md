# CLAUDE.md — src/pipelines/

## What lives here

Pure transformation functions. Same input → same output. No side effects. No imports from store, ws, React, or hooks.

## The four protocol facts you must handle here

These are backend wire format facts — not assumptions. Get them wrong and the UI shows nothing or wrong data.

| Raw field | What to do |
|-----------|-----------|
| `bids/asks: [price, size][]` | Destructure each tuple: `const [price, size] = level` — values are **strings**, call `parseFloat()` |
| `timestamp` in microseconds | `timestampMs = timestamp / 1000` before any date or bucket math |
| No `side` field on trades | `buyer_role === 'taker'` → `'buy'`; `seller_role === 'taker'` → `'sell'` |
| `ltp_change_24h` is a **string** multiplier | `change24h = (parseFloat(ltp_change_24h) - 1) * 100`; last price = `close` (number) |

## Symbol precision table (from backend config.js — do not guess)

```
BTCUSD:  1
ETHUSD:  2
XRPUSD:  4
SOLUSD:  4   ← not 2
PAXGUSD: 2
DOGEUSD: 6   ← not 4
```

## Order book grouping math

Use integer-scaled arithmetic. Never `toFixed` for bucket boundaries.

```
price_int = Math.round(price * 10^precision)
incr_int  = Math.round(increment * 10^precision)
bid_group = Math.floor(price_int / incr_int) * incr_int   // floor = bid price rounds down
ask_group = Math.ceil (price_int / incr_int) * incr_int   // ceil  = ask price rounds up
```

This invariant must hold: `grouped_bid_price < grouped_ask_price` always. Floor/ceil is what enforces it.

## Trade bucket math

```
bucket = Math.floor(trade.timestampMs / 100)
```

`timestampMs` is already converted from microseconds. Using raw microseconds here means trades never merge.

## Test coverage target: ≥ 95%

Pipelines are pure functions — exhaustive coverage is cheap and required. Every edge case (empty input, zero trades, single level, mismatched sides) must have a test.

## Files

- `orderBookPipeline.ts` — `aggregateOrderBook`, returns `ProcessedOrderBook`
- `tradePipeline.ts` — `aggregateTrades`, returns `AggregatedTrade[]`
- `rollingStatsPipeline.ts` — `updateRollingDeque`, `computeRollingStats`
- `tickerPipeline.ts` — `mergeLatestTickers`
- `parsers.ts` — `parseOrderBookMessage`, `parseTradeMessage`, `parseTickerMessage`
