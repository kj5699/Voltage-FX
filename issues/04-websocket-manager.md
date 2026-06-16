# Issue 04 — WebSocketManager: Connect, Subscribe, Unsubscribe, Reconnect, Heartbeat

**Type:** AFK
**Blocked by:** Issue 02

---

## What to build

Implement the singleton `WebSocketManager` class — the single owner of the WebSocket connection for the entire app. No React, no Zustand. Pure TypeScript class that manages connection lifecycle and message routing.

The class exposes four public methods: `connect`, `disconnect`, `subscribe`, `unsubscribe`. All subscription state survives reconnects automatically.

Key shape (from architecture prototype — encodes the interface contract):
```
class WebSocketManager {
  connect(url: string): void
  disconnect(): void
  subscribe(channel: string, symbol: string, handler: (msg: unknown) => void): void
  unsubscribe(channel: string, symbol: string): void
}
```
Subscription registry key: `"${channel}:${symbol}"`.

Reconnect schedule: 1s → 2s → 4s → 8s → 16s → 30s (cap). Reset to 1s on successful open.

Heartbeat: send ping frame every 30s. If no pong within 5s of ping, force-close socket (triggers normal reconnect path).

On `onOpen`: iterate registry and send one subscribe frame per entry. Update `wsStatus` in Zustand store to `'connected'`.

On `onClose`: update `wsStatus` to `'reconnecting'`, schedule reconnect.

On `onMessage`: parse JSON, look up `"${msg.type}:${msg.symbol}"` in registry, call handler if found.

## Acceptance criteria

- [ ] Single WebSocket instance exists for the lifetime of the session (verified via DevTools Network tab — only one WS connection)
- [ ] `subscribe('v2/ticker', 'BTCUSD', handler)` sends correct subscribe frame to server
- [ ] `unsubscribe('l2_orderbook', 'BTCUSD')` sends correct unsubscribe frame and removes handler
- [ ] Calling `subscribe` before `connect` queues the subscription and sends on next `onOpen`
- [ ] On disconnect: `wsStatus` changes to `'reconnecting'`
- [ ] On reconnect: all active subscriptions re-sent automatically, `wsStatus` → `'connected'`
- [ ] Reconnect delays follow exponential schedule (unit tested with mocked timers)
- [ ] Delay resets to 1s after a successful connection
- [ ] Heartbeat timer starts on `onOpen`, stops on `disconnect()`
- [ ] Forced close when pong timeout fires triggers reconnect path (not a second `disconnect()`)
- [ ] `disconnect()` clears all timers and does not schedule reconnect

## Testing scope

Tests T1-1 through T1-8 from `docs/05-TDD-PLAN.md`:
- T1-1: Single connection on init
- T1-2: Message routing to correct handler only
- T1-3: Subscribe sends correct wire frame
- T1-4: Unsubscribe removes handler and sends frame
- T1-5: Reconnect replays active subscriptions
- T1-6: Exponential backoff delays (mock timers)
- T1-7: Heartbeat detects silent drop → triggers reconnect
- T1-8: Clean disconnect — no reconnect scheduled

Use `vitest-websocket-mock` for all tests. No real network calls.
