import type { Symbol } from '@config/symbols'

export type OrderBookLevel = { price: number; size: number }

export type ParsedOrderBook = {
  symbol: Symbol
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  timestampMs: number
}

export type ParsedTrade = {
  symbol: Symbol
  price: number
  size: number
  side: 'buy' | 'sell'
  timestampMs: number
}

export type ParsedTicker = {
  symbol: Symbol
  lastPrice: number
  change24h: number
}

function parseLevel(tuple: [string, string]): OrderBookLevel {
  return { price: parseFloat(tuple[0]), size: parseFloat(tuple[1]) }
}

export function parseOrderBookMessage(raw: Record<string, unknown>): ParsedOrderBook {
  const bids = (raw['bids'] as [string, string][]).map(parseLevel)
  const asks = (raw['asks'] as [string, string][]).map(parseLevel)
  const timestampMs = (raw['timestamp'] as number) / 1000
  return { symbol: raw['symbol'] as Symbol, bids, asks, timestampMs }
}

export function parseTradeMessage(raw: Record<string, unknown>): ParsedTrade {
  const buyerRole = raw['buyer_role'] as string
  const sellerRole = raw['seller_role'] as string
  const side: 'buy' | 'sell' = buyerRole === 'taker' ? 'buy' : sellerRole === 'taker' ? 'sell' : 'buy'
  const timestampMs = (raw['timestamp'] as number) / 1000
  return {
    symbol: raw['symbol'] as Symbol,
    price: parseFloat(raw['price'] as string),
    size: raw['size'] as number,
    side,
    timestampMs,
  }
}

export function parseTickerMessage(raw: Record<string, unknown>): ParsedTicker {
  const ltpChange = parseFloat(raw['ltp_change_24h'] as string)
  return {
    symbol: raw['symbol'] as Symbol,
    lastPrice: raw['close'] as number,
    change24h: (ltpChange - 1) * 100,
  }
}
