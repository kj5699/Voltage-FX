import { useState, useEffect, useCallback } from 'react'

const API_URL = 'http://localhost:3000/intervals'

type ChannelInterval = { min: number; max: number }
type Intervals = Record<string, ChannelInterval>

const PRESETS = {
  Default: { all_trades: { min: 5, max: 20 }, l2_orderbook: { min: 10, max: 40 }, 'v2/ticker': { min: 10, max: 50 } },
  Slow:    { all_trades: { min: 500, max: 1000 }, l2_orderbook: { min: 500, max: 1000 }, 'v2/ticker': { min: 500, max: 1000 } },
  Stress:  { all_trades: { min: 1, max: 5 }, l2_orderbook: { min: 10, max: 20 }, 'v2/ticker': { min: 10, max: 20 } },
}

const DISPLAY_CHANNELS = ['all_trades', 'l2_orderbook', 'v2/ticker'] as const

export function BackendControl() {
  const [intervals, setIntervals] = useState<Intervals | null>(null)
  const [editing, setEditing] = useState<Intervals>({})
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [open, setOpen] = useState(false)

  const fetchIntervals = useCallback(async () => {
    try {
      const res = await fetch(API_URL)
      const data: Intervals = await res.json()
      setIntervals(data)
      setEditing(JSON.parse(JSON.stringify(data)))
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (open) fetchIntervals()
  }, [open, fetchIntervals])

  const apply = useCallback(async (payload: Intervals) => {
    setStatus('saving')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('failed')
      setIntervals(JSON.parse(JSON.stringify(payload)))
      setEditing(JSON.parse(JSON.stringify(payload)))
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 1500)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }, [])

  const handleChange = (channel: string, field: 'min' | 'max', value: string) => {
    const n = parseInt(value, 10)
    if (isNaN(n)) return
    setEditing((prev) => {
      const existing = prev[channel] ?? { min: 1, max: 1 }
      return { ...prev, [channel]: { ...existing, [field]: n } }
    })
  }

  return (
    <div className="backend-ctrl">
      <button
        className="backend-ctrl__toggle"
        onClick={() => setOpen((o) => !o)}
        title="Backend speed control"
      >
        ⚙ Speed
      </button>

      {open && (
        <div className="backend-ctrl__panel">
          <div className="backend-ctrl__header">
            <span className="backend-ctrl__title">Backend Message Rate</span>
            <button className="backend-ctrl__close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="backend-ctrl__presets">
            {Object.entries(PRESETS).map(([label, preset]) => (
              <button
                key={label}
                className="backend-ctrl__preset"
                onClick={() => apply(preset as Intervals)}
              >
                {label}
              </button>
            ))}
          </div>

          {intervals && (
            <table className="backend-ctrl__table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Min (ms)</th>
                  <th>Max (ms)</th>
                </tr>
              </thead>
              <tbody>
                {DISPLAY_CHANNELS.map((ch) => (
                  <tr key={ch}>
                    <td className="backend-ctrl__ch">{ch}</td>
                    <td>
                      <input
                        className="backend-ctrl__input"
                        type="number"
                        min={1}
                        value={editing[ch]?.min ?? ''}
                        onChange={(e) => handleChange(ch, 'min', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="backend-ctrl__input"
                        type="number"
                        min={1}
                        value={editing[ch]?.max ?? ''}
                        onChange={(e) => handleChange(ch, 'max', e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="backend-ctrl__footer">
            <button
              className="backend-ctrl__apply"
              disabled={status === 'saving'}
              onClick={() => apply(editing)}
            >
              {status === 'saving' ? 'Applying…' : status === 'saved' ? '✓ Applied' : status === 'error' ? '✕ Error' : 'Apply'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
