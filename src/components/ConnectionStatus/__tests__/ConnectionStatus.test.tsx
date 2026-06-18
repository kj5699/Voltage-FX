import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ConnectionStatus } from '../ConnectionStatus'
import { useStore } from '@store/store'

beforeEach(() => {
  useStore.setState({ wsStatus: 'disconnected' })
})

// T5-19: Status indicator visual states
describe('T5-19: ConnectionStatus visual states', () => {
  it('shows "Connected" and green dot when connected', () => {
    act(() => { useStore.setState({ wsStatus: 'connected' }) })
    render(<ConnectionStatus />)
    expect(screen.getByText('Connected')).toBeInTheDocument()
    const dot = document.querySelector('.connection-dot')
    expect(dot).toHaveClass('connection-dot--connected')
  })

  it('shows "Reconnecting…" and pulse dot when reconnecting', () => {
    act(() => { useStore.setState({ wsStatus: 'reconnecting' }) })
    render(<ConnectionStatus />)
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
    const dot = document.querySelector('.connection-dot')
    expect(dot).toHaveClass('connection-dot--reconnecting')
  })

  it('shows "Disconnected" and red dot when disconnected', () => {
    act(() => { useStore.setState({ wsStatus: 'disconnected' }) })
    render(<ConnectionStatus />)
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
    const dot = document.querySelector('.connection-dot')
    expect(dot).toHaveClass('connection-dot--disconnected')
  })

  it('shows "Connecting…" and grey dot when connecting', () => {
    act(() => { useStore.setState({ wsStatus: 'connecting' }) })
    render(<ConnectionStatus />)
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
    const dot = document.querySelector('.connection-dot')
    expect(dot).toHaveClass('connection-dot--connecting')
  })
})
