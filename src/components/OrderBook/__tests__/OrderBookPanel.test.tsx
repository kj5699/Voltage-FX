import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { OrderBookPanel } from '../OrderBookPanel'
import { SpreadBar } from '../SpreadBar'
import { GroupingSelector } from '../GroupingSelector'
import { useStore } from '@store/store'
import type { ProcessedOrderBook } from '@pipelines/orderBookPipeline'

vi.mock('@ws/index', () => ({
  wsManager: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}))

vi.mock('@hooks/useOrderBookFlush', () => ({
  useOrderBookFlush: vi.fn(),
}))

function makeOrderBook(overrides: Partial<ProcessedOrderBook> = {}): ProcessedOrderBook {
  return {
    bids: [
      { price: 62560, size: 1.5, cumulativeSize: 1.5, depthWidth: 50 },
      { price: 62550, size: 2.0, cumulativeSize: 3.5, depthWidth: 100 },
    ],
    asks: [
      { price: 62570, size: 1.0, cumulativeSize: 1.0, depthWidth: 40 },
      { price: 62580, size: 1.5, cumulativeSize: 2.5, depthWidth: 100 },
    ],
    midPrice: 62565,
    spread: 10,
    spreadBps: 1.6,
    imbalance: 0.17,
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

// T5-11: Loading skeleton when orderBook is null
describe('T5-11: loading skeleton', () => {
  it('shows skeleton when orderBook is null', () => {
    render(<OrderBookPanel />)
    const skeletonRows = document.querySelectorAll('.ob-skeleton__row')
    expect(skeletonRows.length).toBeGreaterThan(0)
  })

  it('shows no price levels when orderBook is null', () => {
    render(<OrderBookPanel />)
    expect(screen.queryByRole('table')).toBeNull()
  })
})

// T5-6: Ask order rendering (ascending price)
describe('T5-6: asks rendered in ascending price order', () => {
  it('renders asks with lowest price first', () => {
    act(() => { useStore.setState({ orderBook: makeOrderBook() }) })
    render(<OrderBookPanel />)
    const askTable = screen.getByRole('table', { name: /ask orders/i })
    const rows = askTable.querySelectorAll('tbody tr')
    const prices = Array.from(rows).map((r) => r.querySelectorAll('td')[1]?.textContent)
    expect(prices[0]).toBe('62570.0') // lowest ask first
    expect(prices[1]).toBe('62580.0')
  })
})

// T5-7: Bid order rendering (descending price)
describe('T5-7: bids rendered in descending price order', () => {
  it('renders bids with highest price first', () => {
    act(() => { useStore.setState({ orderBook: makeOrderBook() }) })
    render(<OrderBookPanel />)
    const bidTable = screen.getByRole('table', { name: /bid orders/i })
    const rows = bidTable.querySelectorAll('tbody tr')
    const prices = Array.from(rows).map((r) => r.querySelectorAll('td')[1]?.textContent)
    expect(prices[0]).toBe('62560.0') // highest bid first
    expect(prices[1]).toBe('62550.0')
  })
})

// T5-8: Spread metrics
describe('T5-8: spread metrics', () => {
  it('displays mid price', () => {
    render(<SpreadBar data={makeOrderBook()} />)
    expect(screen.getByText('62565.00')).toBeInTheDocument()
  })

  it('displays spread', () => {
    render(<SpreadBar data={makeOrderBook()} />)
    expect(screen.getByText('10.0000')).toBeInTheDocument()
  })

  it('displays spread bps', () => {
    render(<SpreadBar data={makeOrderBook()} />)
    expect(screen.getByText('1.6')).toBeInTheDocument()
  })

  it('shows Bid heavy when imbalance > 0.1', () => {
    render(<SpreadBar data={makeOrderBook({ imbalance: 0.17 })} />)
    expect(screen.getByText('Bid heavy')).toBeInTheDocument()
  })

  it('shows Ask heavy when imbalance < -0.1', () => {
    render(<SpreadBar data={makeOrderBook({ imbalance: -0.2 })} />)
    expect(screen.getByText('Ask heavy')).toBeInTheDocument()
  })

  it('shows Balanced when imbalance is near 0', () => {
    render(<SpreadBar data={makeOrderBook({ imbalance: 0.05 })} />)
    expect(screen.getByText('Balanced')).toBeInTheDocument()
  })

  it('shows — for null metrics', () => {
    render(<SpreadBar data={{ bids: [], asks: [], midPrice: null, spread: null, spreadBps: null, imbalance: null }} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(4)
  })
})

// T5-9: Grouping selector interaction
describe('T5-9: grouping selector', () => {
  it('calls setGroupingIncrement when option changes', () => {
    useStore.setState({ focusedSymbol: 'BTCUSD', groupingIncrement: 0.5 })
    render(<GroupingSelector />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '50' } })
    expect(useStore.getState().groupingIncrement).toBe(50)
  })
})

// T5-10: Grouping options differ by symbol
describe('T5-10: grouping selector shows symbol-specific options', () => {
  it('BTCUSD options differ from XRPUSD options', () => {
    useStore.setState({ focusedSymbol: 'BTCUSD', groupingIncrement: 0.5 })
    const { unmount } = render(<GroupingSelector />)
    const btcOptions = Array.from(document.querySelectorAll('option')).map((o) => o.value)
    unmount()

    useStore.setState({ focusedSymbol: 'XRPUSD', groupingIncrement: 0.0001 })
    render(<GroupingSelector />)
    const xrpOptions = Array.from(document.querySelectorAll('option')).map((o) => o.value)

    expect(btcOptions).not.toEqual(xrpOptions)
    expect(btcOptions).toContain('0.5')
    expect(xrpOptions).toContain('0.0001')
  })
})
