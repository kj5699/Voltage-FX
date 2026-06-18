import { memo } from 'react'
import { useWsStatus } from '@store/index'
import type { WsStatus } from '@ws/WebSocketManager'

const STATUS_CONFIG: Record<WsStatus, { label: string; dotClass: string }> = {
  connected:    { label: 'Connected',    dotClass: 'connection-dot--connected' },
  connecting:   { label: 'Connecting…',  dotClass: 'connection-dot--connecting' },
  reconnecting: { label: 'Reconnecting…', dotClass: 'connection-dot--reconnecting' },
  disconnected: { label: 'Disconnected', dotClass: 'connection-dot--disconnected' },
}

export const ConnectionStatus = memo(function ConnectionStatus() {
  const status = useWsStatus()
  const { label, dotClass } = STATUS_CONFIG[status]

  return (
    <div className="connection-status" aria-live="polite">
      <span className={`connection-dot ${dotClass}`} aria-hidden="true" />
      <span className="connection-status__label">{label}</span>
    </div>
  )
})
