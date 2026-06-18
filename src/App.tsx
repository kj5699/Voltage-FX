import { TickerBar } from '@components/TickerBar'

function App() {
  return (
    <div className="app">
      <TickerBar />
      <main style={{ padding: '1rem', color: 'var(--color-text-secondary)' }}>
        Order book and trades panels coming soon.
      </main>
    </div>
  )
}

export default App
