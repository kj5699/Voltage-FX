import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { wsManager } from '@ws/index'
import { useStore } from '@store/store'

// Wire WS status into store
wsManager.setStatusCallback((status) => useStore.getState().setWsStatus(status))
wsManager.connect('ws://localhost:8080')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
