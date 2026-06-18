import { TickerBar } from '@components/TickerBar'
import { OrderBookPanel } from '@components/OrderBook'
import { TradesFeedPanel } from '@components/TradesFeed'
import { ConnectionStatus } from '@components/ConnectionStatus'
import { BackendControl } from '@components/BackendControl'

function App() {
  return (
    <div className="app">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', padding: '0 12px', gap: '8px' }}>
        <TickerBar />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <ConnectionStatus />
          <BackendControl />
        </div>
      </div>
      <div className="app__panels">
        <OrderBookPanel />
        <TradesFeedPanel />
      </div>
    </div>
  )
}

export default App
