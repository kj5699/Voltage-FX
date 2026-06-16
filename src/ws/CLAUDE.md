# CLAUDE.md — src/ws/

## What lives here

`WebSocketManager` — a singleton plain TypeScript class that owns the single WebSocket connection for the entire app. Nothing else goes in this directory.

## Rules

**One connection, always.** Never instantiate a second `WebSocket`. All 8 channels (6 tickers + 1 orderbook + 1 trades) are subscriptions on the same socket.

**No React, no Zustand (except wsStatus).** The only Zustand call allowed here is `store.setWsStatus(...)` on connection state transitions. All data goes to registered handlers, not the store.

**Never call handlers synchronously on subscribe.** Subscribe only registers the handler and sends the WS frame. Data arrives via `onmessage`.

## Subscription registry

Key format: `"${channel}:${symbol}"` e.g. `"l2_orderbook:BTCUSD"`, `"v2/ticker:ETHUSD"`.

The registry is the source of truth for what to re-subscribe on reconnect. `onOpen` iterates it and sends one subscribe frame per entry.

## Wire format (from backend README)

Subscribe frame:
```json
{ "type": "subscribe", "payload": { "channels": [{ "name": "l2_orderbook", "symbols": ["BTCUSD"] }] } }
```

Unsubscribe frame:
```json
{ "type": "unsubscribe", "payload": { "channels": [{ "name": "l2_orderbook", "symbols": ["BTCUSD"] }] } }
```

## Reconnect schedule

1s → 2s → 4s → 8s → 16s → 30s (capped). Reset to 1s after successful `onOpen`.

## Heartbeat

Ping every 30s. If no pong within 5s of ping, call `ws.close()` — this triggers `onClose` and the normal reconnect path. Do not call `reconnect()` directly from the heartbeat.

## What to test (see Issue 04)

All tests use `vitest-websocket-mock`. Never make real network calls in tests.
