import { TickerBar } from '@components/TickerBar'
import { OrderBookPanel } from '@components/OrderBook'
import { TradesFeedPanel } from '@components/TradesFeed'

function App() {
  return (
    <div className="app">
      <TickerBar />
      <div className="app__panels">
        <OrderBookPanel />
        <TradesFeedPanel />
      </div>
    </div>
  )
}

export default App
