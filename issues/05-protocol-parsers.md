# Issue 05 — Backend Protocol Parsers

**Type:** AFK
**Blocked by:** Issue 02

---

## What to build

Implement pure parser functions that convert raw backend WebSocket frames into typed domain objects. These parsers are the single point where backend wire format is translated — nothing downstream touches raw frame data.

This issue exists because the backend wire format has four non-obvious properties that would cause silent failures if assumed away:

1. Orderbook `bids`/`asks` are `[price, size][]` tuples — not objects
2. All timestamps are **microseconds** (`Date.now() * 1000`) — not milliseconds
3. Trades have no `side` field — derived from `buyer_role`/`seller_role`
4. `ltp_change_24h` is a **multiplier** (1.0050 = +0.50%) — not a percentage

### Parser functions to implement

**`parseOrderBookMessage(raw)`** → `{ symbol, bids: OrderBookLevel[], asks: OrderBookLevel[], timestampMs }`
- Destructures each `[price, size]` tuple into `{ price: number, size: number }`
- Converts `timestamp` (μs) to `timestampMs` (ms) by dividing by 1000
- Parses price/size to numbers (backend sends formatted strings via `toFixed`)

**`parseTradeMessage(raw)`** → `{ symbol, price, size, side: 'buy'|'sell', timestampMs }`
- Derives `side`: `buyer_role === 'taker'` → `'buy'`; `seller_role === 'taker'` → `'sell'`
- Converts `timestamp` (μs) → `timestampMs` (ms)

**`parseTickerMessage(raw)`** → `{ symbol, lastPrice, change24h }`
- `lastPrice` = `raw.close`
- `change24h` = `(raw.ltp_change_24h - 1) * 100`

### Types to define

```
OrderBookLevel = { price: number; size: number }
ParsedOrderBook = { symbol: Symbol; bids: OrderBookLevel[]; asks: OrderBookLevel[]; timestampMs: number }
ParsedTrade    = { symbol: Symbol; price: number; size: number; side: 'buy' | 'sell'; timestampMs: number }
ParsedTicker   = { symbol: Symbol; lastPrice: number; change24h: number }
Symbol         = 'BTCUSD' | 'ETHUSD' | 'XRPUSD' | 'SOLUSD' | 'PAXGUSD' | 'DOGEUSD'
```

## Acceptance criteria

- [ ] `parseOrderBookMessage` returns `OrderBookLevel[]` objects (not raw tuples)
- [ ] `parseOrderBookMessage` timestamp field is in milliseconds (value ≈ `Date.now()`)
- [ ] `parseTradeMessage` returns `side: 'buy'` when `buyer_role === 'taker'`
- [ ] `parseTradeMessage` returns `side: 'sell'` when `seller_role === 'taker'`
- [ ] `parseTradeMessage` timestamp field is in milliseconds
- [ ] `parseTickerMessage` returns `change24h` as a percentage (e.g. input `1.0234` → output `2.34`)
- [ ] `parseTickerMessage` `lastPrice` comes from `raw.close`, not `raw.price` or `raw.ltp`
- [ ] All three parsers are typed — no `any` in function signatures or return types
- [ ] All three parsers are pure functions (no imports from store, ws, or React)

## Testing scope

Tests T2-0a through T2-0e from `docs/05-TDD-PLAN.md`:
- T2-0a: Orderbook tuple destructuring produces correct objects
- T2-0b: Trade side derivation — both directions (buyer taker → buy, seller taker → sell)
- T2-0c: Ticker change multiplier conversion (1.0234 → 2.34)
- T2-0d: Microsecond timestamp → millisecond normalisation
- T2-0e: Two trades 50ms apart at same price merge correctly in downstream bucket math (validates that ms timestamps are used, not μs)

These 5 tests are the **protocol compliance gate** — they run first in CI and block all pipeline tests if they fail.
