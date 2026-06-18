import { TickerBar } from '@components/TickerBar'
import { OrderBookPanel } from '@components/OrderBook'
import { TradesFeedPanel } from '@components/TradesFeed'
import { ConnectionStatus } from '@components/ConnectionStatus'

function App() {
  return (
    <div className="app">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)' }}>
        <TickerBar />
        <ConnectionStatus />
      </div>
      <div className="app__panels">
        <OrderBookPanel />
        <TradesFeedPanel />
      </div>
    </div>
  )
}

export default App
