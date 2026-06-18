import { TickerBar } from '@components/TickerBar'
import { OrderBookPanel } from '@components/OrderBook'

function App() {
  return (
    <div className="app">
      <TickerBar />
      <div className="app__panels">
        <OrderBookPanel />
        <main style={{ flex: 1, padding: '1rem', color: 'var(--color-text-secondary)' }}>
          Trades feed coming soon.
        </main>
      </div>
    </div>
  )
}

export default App
