export type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
export type MessageHandler = (msg: unknown) => void
export type RawHandler = (raw: string) => void

const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000] as const
const PING_INTERVAL_MS = 30_000
const PONG_TIMEOUT_MS = 5_000

export class WebSocketManager {
  private ws: WebSocket | null = null
  private url = ''
  private registry = new Map<string, MessageHandler>()
  private rawRegistry = new Map<string, RawHandler>()
  private backoffIndex = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  private onStatusChange: (status: WsStatus) => void

  constructor(onStatusChange: (status: WsStatus) => void = () => undefined) {
    this.onStatusChange = onStatusChange
  }

  setStatusCallback(cb: (status: WsStatus) => void): void {
    this.onStatusChange = cb
  }

  connect(url: string): void {
    this.url = url
    this.intentionalClose = false
    this.openSocket()
  }

  disconnect(): void {
    this.intentionalClose = true
    this.clearReconnectTimer()
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.onStatusChange('disconnected')
  }

  subscribe(channel: string, symbol: string, handler: MessageHandler): void {
    const key = `${channel}:${symbol}`
    this.registry.set(key, handler)
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendFrame('subscribe', channel, symbol)
    }
  }

  unsubscribe(channel: string, symbol: string): void {
    const key = `${channel}:${symbol}`
    this.registry.delete(key)
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendFrame('unsubscribe', channel, symbol)
    }
  }

  rawSubscribe(channel: string, symbol: string, handler: RawHandler): void {
    const key = `${channel}:${symbol}`
    this.rawRegistry.set(key, handler)
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendFrame('subscribe', channel, symbol)
    }
  }

  rawUnsubscribe(channel: string, symbol: string): void {
    const key = `${channel}:${symbol}`
    this.rawRegistry.delete(key)
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendFrame('unsubscribe', channel, symbol)
    }
  }

  private openSocket(): void {
    this.onStatusChange('connecting')
    const ws = new WebSocket(this.url)
    this.ws = ws

    ws.onopen = () => {
      this.backoffIndex = 0
      this.clearReconnectTimer()
      this.onStatusChange('connected')
      for (const key of this.registry.keys()) {
        const [channel, symbol] = key.split(':') as [string, string]
        this.sendFrame('subscribe', channel, symbol)
      }
      for (const key of this.rawRegistry.keys()) {
        const [channel, symbol] = key.split(':') as [string, string]
        this.sendFrame('subscribe', channel, symbol)
      }
      this.startHeartbeat()
    }

    ws.onclose = () => {
      if (ws !== this.ws) return
      this.stopHeartbeat()
      if (!this.intentionalClose) {
        this.onStatusChange('reconnecting')
        this.scheduleReconnect()
      }
    }

    ws.onmessage = (event: MessageEvent) => {
      let msg: unknown
      try {
        msg = JSON.parse(event.data as string)
      } catch {
        return
      }
      if (typeof msg !== 'object' || msg === null) return
      const record = msg as Record<string, unknown>
      const type = record['type']
      const symbol = record['symbol']
      if (typeof type !== 'string' || typeof symbol !== 'string') return
      const key = `${type}:${symbol}`
      const handler = this.registry.get(key)
      handler?.(msg)
      const rawHandler = this.rawRegistry.get(key)
      rawHandler?.(event.data as string)
    }
  }

  private sendFrame(type: 'subscribe' | 'unsubscribe', channel: string, symbol: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({
      type,
      payload: { channels: [{ name: channel, symbols: [symbol] }] },
    }))
  }

  private scheduleReconnect(): void {
    const delay = BACKOFF_DELAYS[Math.min(this.backoffIndex, BACKOFF_DELAYS.length - 1)] ?? 30000
    this.backoffIndex = Math.min(this.backoffIndex + 1, BACKOFF_DELAYS.length - 1)
    this.reconnectTimer = setTimeout(() => {
      this.openSocket()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
        this.pongTimer = setTimeout(() => {
          // No pong received — force close to trigger reconnect path
          this.ws?.close()
        }, PONG_TIMEOUT_MS)
      }
    }, PING_INTERVAL_MS)

    // Clear pong timer when a pong arrives
    const capturedWs = this.ws!
    const originalOnMessage = capturedWs.onmessage
    capturedWs.onmessage = (event: MessageEvent) => {
      let msg: unknown
      try { msg = JSON.parse(event.data as string) } catch { /* ignore */ }
      if (typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>)['type'] === 'pong') {
        if (this.pongTimer !== null) {
          clearTimeout(this.pongTimer)
          this.pongTimer = null
        }
        return
      }
      originalOnMessage?.call(capturedWs, event)
    }
  }

  private stopHeartbeat(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    if (this.pongTimer !== null) {
      clearTimeout(this.pongTimer)
      this.pongTimer = null
    }
  }
}

export const wsManager = new WebSocketManager()
