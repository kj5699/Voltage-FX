# Issue 18 — WebSocket Reconnect UI: Status Indicator, Backoff, Re-subscribe on Recovery

**Type:** AFK
**Blocked by:** Issues 04, 11

---

## What to build

Wire the `WebSocketManager` lifecycle events into the Zustand store's `wsStatus` field and implement the `ConnectionStatus` component. The reconnect logic itself lives in `WebSocketManager` (Issue 04) — this issue connects it to the UI and verifies the full recovery flow end-to-end.

**`ConnectionStatus` component:**
- Reads `useWsStatus()` from store
- Renders a coloured dot + label:
  - `connected` → green dot, "Connected · {N} channels"
  - `reconnecting` → yellow dot, "Reconnecting…" (animated pulse)
  - `disconnected` → red dot, "Disconnected"
  - `connecting` → grey dot, "Connecting…"
- Always visible (part of the app shell, not inside any panel)

**Store wiring:** `WebSocketManager` calls `store.setWsStatus(...)` on state transitions — this is the only Zustand call allowed inside `WebSocketManager`. All other data goes through registered handlers.

**Recovery verification:** On reconnect, `WebSocketManager.onOpen` replays all subscriptions. The UI should show live data again within one flush interval after reconnection, without any user action.

## Acceptance criteria

- [ ] `wsStatus = 'connected'` → green indicator shows "Connected" (T5-19)
- [ ] `wsStatus = 'reconnecting'` → yellow indicator shows "Reconnecting…" (T5-19)
- [ ] `wsStatus = 'disconnected'` → red indicator shows "Disconnected" (T5-19)
- [ ] `ConnectionStatus` re-renders only on `wsStatus` changes — not on ticker/orderbook/trades updates
- [ ] When backend is stopped: status changes to 'reconnecting' within 35s (heartbeat timeout + reconnect)
- [ ] When backend restarts: all channels re-subscribed automatically; ticker prices resume updating
- [ ] Status returns to 'connected' after successful reconnect (T6-4)
- [ ] No page refresh required to recover from a backend restart (E2E — T7-5)
- [ ] Reconnect delay sequence follows 1s → 2s → 4s → 8s → 16s → 30s (verified in unit tests from Issue 04)

## Testing scope

Test T5-19 from `docs/05-TDD-PLAN.md`.
Integration test T6-4: MSW drops connection → reconnects → all 8 subscribe frames re-sent.
E2E test T7-5 (Playwright): backend process restarted → UI recovers within 35s.
