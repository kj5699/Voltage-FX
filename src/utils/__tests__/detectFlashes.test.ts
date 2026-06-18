import { describe, it, expect } from 'vitest'
import { detectFlashes, buildSizeMap } from '../detectFlashes'
import type { ProcessedLevel } from '@pipelines/orderBookPipeline'

function levels(entries: Array<[number, number]>): ProcessedLevel[] {
  return entries.map(([price, size]) => ({ price, size, cumulativeSize: size, depthWidth: 0 }))
}

// T5-12: Flash detection
describe('T5-12: detectFlashes', () => {
  it('returns green when size increases > 10%', () => {
    const prev = buildSizeMap(levels([[62560, 1.0]]))
    const next = buildSizeMap(levels([[62560, 1.15]]))
    const result = detectFlashes(prev, next)
    expect(result.get(62560)).toBe('green')
  })

  it('returns red when size decreases > 10%', () => {
    const prev = buildSizeMap(levels([[62560, 1.0]]))
    const next = buildSizeMap(levels([[62560, 0.85]]))
    const result = detectFlashes(prev, next)
    expect(result.get(62560)).toBe('red')
  })

  it('returns no flash for ≤ 10% change', () => {
    const prev = buildSizeMap(levels([[62560, 1.0]]))
    const next = buildSizeMap(levels([[62560, 1.09]]))
    const result = detectFlashes(prev, next)
    expect(result.get(62560)).toBeUndefined()
  })

  it('returns no flash for a 9% change (below threshold)', () => {
    const prev = buildSizeMap(levels([[62560, 1.0]]))
    const next = buildSizeMap(levels([[62560, 1.09]]))
    const result = detectFlashes(prev, next)
    expect(result.get(62560)).toBeUndefined()
  })

  it('does not flash new levels (prevSize === 0)', () => {
    const prev = buildSizeMap(levels([]))
    const next = buildSizeMap(levels([[62560, 2.0]]))
    const result = detectFlashes(prev, next)
    expect(result.size).toBe(0)
  })

  it('handles multiple levels independently', () => {
    const prev = buildSizeMap(levels([[62560, 1.0], [62550, 1.0]]))
    const next = buildSizeMap(levels([[62560, 1.5], [62550, 0.8]]))
    const result = detectFlashes(prev, next)
    expect(result.get(62560)).toBe('green')
    expect(result.get(62550)).toBe('red')
  })

  it('returns empty map when nothing changes', () => {
    const prev = buildSizeMap(levels([[62560, 1.0]]))
    const next = buildSizeMap(levels([[62560, 1.0]]))
    const result = detectFlashes(prev, next)
    expect(result.size).toBe(0)
  })
})

describe('buildSizeMap', () => {
  it('builds map keyed by price', () => {
    const map = buildSizeMap(levels([[62560, 1.5], [62550, 2.0]]))
    expect(map.get(62560)).toBe(1.5)
    expect(map.get(62550)).toBe(2.0)
  })

  it('returns empty map for empty input', () => {
    expect(buildSizeMap([]).size).toBe(0)
  })
})
