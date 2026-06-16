# Issue 01 — Backend Setup & Smoke Test

**Type:** HITL
**Blocked by:** None — start here

---

## What to build

Get the stress-test backend running locally and verify all four channels emit well-formed data. This is a prerequisite for every other issue. No frontend code is written here.

## Acceptance criteria

- [ ] Repository cloned: `https://github.com/saxenanickk/socket-custom-load`
- [ ] Backend starts without errors via `bun install && bun start` (or `docker compose up`)
- [ ] WebSocket endpoint responds at `ws://localhost:8080`
- [ ] HTTP config API responds at `http://localhost:3000/intervals`
- [ ] Manual WebSocket smoke test (wscat or browser DevTools) confirms:
  - `v2/ticker` emits for a subscribed symbol within 200ms
  - `l2_orderbook` emits a 500-level snapshot with `bids` and `asks` as `[price, size][]` tuples
  - `all_trades` emits with `buyer_role`, `seller_role` fields (no `side` field)
  - Timestamps on all messages are in **microseconds** (value > `Date.now() * 900`)
- [ ] Runtime config API tested: `POST /intervals` with `{"all_trades": {"min": 1, "max": 5}}` increases trade rate visibly
- [ ] Backend behaviour documented in a local note if it differs from the README

## Testing scope

Manual verification only. No automated tests in this issue.
