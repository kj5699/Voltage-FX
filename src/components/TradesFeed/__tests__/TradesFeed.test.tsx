import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VirtualTradeList } from '../VirtualTradeList'
import { TradesFeedPanel } from '../TradesFeedPanel'
import { useStore } from '@store/store'
import type { AggregatedTrade } from '@pipelines/tradePipeline'

vi.mock('@ws/index', () => ({
  wsManager: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}))

vi.mock('@hooks/useTradesFlush', () => ({
  useTradesFlush: vi.fn(),
}))

function makeTrade(overrides: Partial<AggregatedTrade> = {}): AggregatedTrade {
  return {
    id: 'test-id',
    time: 1718000000000,
    price: 62000,
    side: 'buy',
    size: 1.5,
    count: 1,
    isLarge: false,
    ...overrides,
  }
}

beforeEach(() => {
  useStore.setState({
    wsStatus: 'disconnected',
    focusedSymbol: 'BTCUSD',
    focusSeqId: 0,
    tickers: {},
    orderBook: null,
    groupingIncrement: 0.5,
    trades: [],
    rollingStats: null,
  })
})

// T5-13: Buy/sell colour coding
describe('T5-13: buy/sell colour classes', () => {
  it('buy trade has trade-row--buy class', () => {
    const trades = [makeTrade({ side: 'buy' })]
    render(<VirtualTradeList trades={trades} height={400} />)
    // react-window renders rows; check DOM class
    const rows = document.querySelectorAll('.trade-row--buy')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('sell trade has trade-row--sell class', () => {
    const trades = [makeTrade({ side: 'sell' })]
    render(<VirtualTradeList trades={trades} height={400} />)
    const rows = document.querySelectorAll('.trade-row--sell')
    expect(rows.length).toBeGreaterThan(0)
  })
})

// T5-14: Count badge
describe('T5-14: count badge for aggregated trades', () => {
  it('shows (3) badge when count=3', () => {
    const trades = [makeTrade({ count: 3 })]
    render(<VirtualTradeList trades={trades} height={400} />)
    expect(screen.getByText('(3)')).toBeInTheDocument()
  })

  it('no badge when count=1', () => {
    const trades = [makeTrade({ count: 1 })]
    render(<VirtualTradeList trades={trades} height={400} />)
    expect(screen.queryByText('(1)')).toBeNull()
  })
})

// T5-15: Large trade highlight
describe('T5-15: large trade class', () => {
  it('large trade has trade-row--large class', () => {
    const trades = [makeTrade({ isLarge: true })]
    render(<VirtualTradeList trades={trades} height={400} />)
    const largeRows = document.querySelectorAll('.trade-row--large')
    expect(largeRows.length).toBeGreaterThan(0)
  })

  it('normal trade does not have trade-row--large class', () => {
    const trades = [makeTrade({ isLarge: false })]
    render(<VirtualTradeList trades={trades} height={400} />)
    const largeRows = document.querySelectorAll('.trade-row--large')
    expect(largeRows.length).toBe(0)
  })
})

// T5-18: Threshold change
describe('T5-18: large trade threshold input', () => {
  it('renders threshold input with default value', () => {
    render(<TradesFeedPanel />)
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    expect(input.defaultValue).toBe('10000')
  })
})

// DOM node count test — react-window keeps it sparse
describe('DOM node count with react-window', () => {
  it('renders far fewer DOM rows than trade count (virtualization)', () => {
    const manyTrades = Array.from({ length: 100 }, (_, i) =>
      makeTrade({ id: `t${i}`, price: 62000 + i, time: 1718000000000 + i }),
    )
    render(<VirtualTradeList trades={manyTrades} height={200} />)
    const rows = document.querySelectorAll('.trade-row')
    // With 100 trades but height=200 (≈5 visible rows + overscan), DOM should be << 100
    expect(rows.length).toBeLessThan(30)
  })
})

// Timestamp format
describe('timestamp formatting', () => {
  it('formats time as HH:MM:SS.ms', () => {
    // 2024-06-10 14:32:05.234 UTC — use a fixed known ms value
    const trades = [makeTrade({ time: new Date('2024-06-10T14:32:05.234Z').getTime() })]
    render(<VirtualTradeList trades={trades} height={400} />)
    // The format is HH:MM:SS.ms — exact value depends on local timezone
    // Just verify the pattern exists in DOM
    const timeEl = document.querySelector('.trade-row__time')
    expect(timeEl?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/)
  })
})
