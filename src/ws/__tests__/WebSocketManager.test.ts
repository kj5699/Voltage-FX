import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WS from 'vitest-websocket-mock'
import { WebSocketManager } from '../WebSocketManager'

const URL = 'ws://localhost:9999'

let server: WS
let statusHistory: string[]
let manager: WebSocketManager

beforeEach(() => {
  server = new WS(URL)
  statusHistory = []
  manager = new WebSocketManager((s) => statusHistory.push(s))
})

afterEach(async () => {
  manager.disconnect()
  WS.clean()
  vi.useRealTimers()
})

// T1-1: Single connection
describe('T1-1: connection lifecycle', () => {
  it('emits connecting then connected on open', async () => {
    manager.connect(URL)
    await server.connected
    expect(statusHistory).toEqual(['connecting', 'connected'])
  })
})

// T1-2: Message routing
describe('T1-2: message routing', () => {
  it('routes message to correct handler only', async () => {
    const btcHandler = vi.fn()
    const ethHandler = vi.fn()
    manager.connect(URL)
    await server.connected
    manager.subscribe('v2/ticker', 'BTCUSD', btcHandler)
    manager.subscribe('v2/ticker', 'ETHUSD', ethHandler)
    await server.nextMessage
    await server.nextMessage

    server.send(JSON.stringify({ type: 'v2/ticker', symbol: 'BTCUSD', close: 65000 }))

    expect(btcHandler).toHaveBeenCalledTimes(1)
    expect(ethHandler).not.toHaveBeenCalled()
  })

  it('ignores messages with unknown channel:symbol', async () => {
    const handler = vi.fn()
    manager.connect(URL)
    await server.connected
    manager.subscribe('v2/ticker', 'BTCUSD', handler)
    await server.nextMessage

    server.send(JSON.stringify({ type: 'all_trades', symbol: 'BTCUSD', price: 65000 }))

    expect(handler).not.toHaveBeenCalled()
  })
})

// T1-3: Subscribe sends correct wire frame
describe('T1-3: subscribe frame', () => {
  it('sends correct subscribe frame on subscribe()', async () => {
    manager.connect(URL)
    await server.connected
    manager.subscribe('l2_orderbook', 'BTCUSD', vi.fn())

    const frame = JSON.parse(await server.nextMessage as string)
    expect(frame).toEqual({
      type: 'subscribe',
      payload: { channels: [{ name: 'l2_orderbook', symbols: ['BTCUSD'] }] },
    })
  })

  it('queues subscription made before connect and sends on open', async () => {
    manager.subscribe('v2/ticker', 'BTCUSD', vi.fn())
    manager.connect(URL)
    await server.connected

    const frame = JSON.parse(await server.nextMessage as string)
    expect(frame.type).toBe('subscribe')
    expect(frame.payload.channels[0].name).toBe('v2/ticker')
  })
})

// T1-4: Unsubscribe
describe('T1-4: unsubscribe', () => {
  it('sends unsubscribe frame and stops routing messages', async () => {
    const handler = vi.fn()
    manager.connect(URL)
    await server.connected
    manager.subscribe('v2/ticker', 'BTCUSD', handler)
    await server.nextMessage

    manager.unsubscribe('v2/ticker', 'BTCUSD')
    const unsubFrame = JSON.parse(await server.nextMessage as string)
    expect(unsubFrame.type).toBe('unsubscribe')

    server.send(JSON.stringify({ type: 'v2/ticker', symbol: 'BTCUSD', close: 65000 }))
    expect(handler).not.toHaveBeenCalled()
  })
})

// T1-5: Reconnect replays active subscriptions
describe('T1-5: reconnect replays subscriptions', () => {
  it('re-sends subscribe frames after reconnect', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const handler = vi.fn()
    manager.connect(URL)
    await server.connected
    manager.subscribe('all_trades', 'BTCUSD', handler)
    await server.nextMessage // initial subscribe frame

    server.close()
    WS.clean()
    const server2 = new WS(URL)

    // Advance past first backoff (1s)
    await vi.advanceTimersByTimeAsync(1100)
    await server2.connected

    const resubFrame = JSON.parse(await server2.nextMessage as string)
    expect(resubFrame.type).toBe('subscribe')
    expect(resubFrame.payload.channels[0].name).toBe('all_trades')
    server2.close()
  }, 15_000)
})

// T1-6: Exponential backoff delays
describe('T1-6: exponential backoff', () => {
  it('uses 1s delay on first failure, resets to 1s after success', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    manager.connect(URL)
    await server.connected

    // First disconnect → reconnect after 1s
    server.close()
    WS.clean()
    expect(statusHistory.at(-1)).toBe('reconnecting')

    const s2 = new WS(URL)
    // Should NOT have reconnected before 1s
    await vi.advanceTimersByTimeAsync(900)
    expect(statusHistory.filter(s => s === 'connected').length).toBe(1)

    // After 1s — connects
    await vi.advanceTimersByTimeAsync(200)
    await s2.connected
    expect(statusHistory.filter(s => s === 'connected').length).toBe(2)

    // Second disconnect after a successful open → backoff resets to 1s again
    s2.close()
    WS.clean()
    const s3 = new WS(URL)
    await vi.advanceTimersByTimeAsync(900)
    expect(statusHistory.filter(s => s === 'connected').length).toBe(2)
    await vi.advanceTimersByTimeAsync(200)
    await s3.connected
    expect(statusHistory.filter(s => s === 'connected').length).toBe(3)
    s3.close()
  }, 15_000)

  it('resets delay to 1s after successful open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    manager.connect(URL)
    await server.connected

    // Disconnect and reconnect once to consume backoffIndex 0
    server.close()
    WS.clean()
    const s2 = new WS(URL)
    await vi.advanceTimersByTimeAsync(1100)
    await s2.connected

    // Now disconnect again — backoffIndex reset to 0 after s2 connected, so 1s again
    s2.close()
    WS.clean()
    const s3 = new WS(URL)

    // Should reconnect in ~1s (not 2s)
    await vi.advanceTimersByTimeAsync(1050)
    await s3.connected
    expect(statusHistory.filter(s => s === 'connected').length).toBe(3)
    s3.close()
  }, 15_000)
})

// T1-7: Heartbeat / silent drop
describe('T1-7: heartbeat detects silent drop', () => {
  it('sends ping and triggers reconnect if no pong within 5s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    manager.connect(URL)
    await server.connected

    // Advance to first ping (30s)
    await vi.advanceTimersByTimeAsync(30_000)

    const pingMsg = JSON.parse(await server.nextMessage as string)
    expect(pingMsg.type).toBe('ping')

    // Do NOT send pong — advance 5s for pong timeout
    await vi.advanceTimersByTimeAsync(5_001)
    expect(statusHistory.at(-1)).toBe('reconnecting')
  }, 15_000)
})

// T1-8: Clean disconnect — no reconnect
describe('T1-8: clean disconnect', () => {
  it('does not schedule reconnect on intentional disconnect', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    manager.connect(URL)
    await server.connected

    manager.disconnect()
    expect(statusHistory.at(-1)).toBe('disconnected')

    // Nothing should reconnect
    await vi.advanceTimersByTimeAsync(60_000)
    expect(statusHistory.filter(s => s === 'connecting').length).toBe(1)
  }, 15_000)
})
