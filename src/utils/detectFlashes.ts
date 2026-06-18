export type FlashDirection = 'green' | 'red'
export type FlashResult = Map<number, FlashDirection>

const FLASH_THRESHOLD = 0.1 // 10% change triggers a flash

export function detectFlashes(
  prevSizeMap: Map<number, number>,
  nextSizeMap: Map<number, number>,
): FlashResult {
  const result: FlashResult = new Map()

  for (const [price, nextSize] of nextSizeMap) {
    const prevSize = prevSizeMap.get(price) ?? 0
    if (prevSize === 0) continue // new level — no flash
    const change = (nextSize - prevSize) / prevSize
    if (change > FLASH_THRESHOLD) result.set(price, 'green')
    else if (change < -FLASH_THRESHOLD) result.set(price, 'red')
  }

  return result
}

export function buildSizeMap(
  levels: ReadonlyArray<{ price: number; size: number }>,
): Map<number, number> {
  const map = new Map<number, number>()
  for (const level of levels) map.set(level.price, level.size)
  return map
}
