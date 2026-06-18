export const SYMBOLS = ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'PAXGUSD', 'DOGEUSD'] as const
export type Symbol = typeof SYMBOLS[number]

export function isSymbol(v: string): v is Symbol {
  return (SYMBOLS as readonly string[]).includes(v)
}

export const SYMBOL_CONFIG: Record<Symbol, { precision: number; increments: number[] }> = {
  BTCUSD:  { precision: 1, increments: [0.5, 1, 2, 5, 10, 25, 50, 100] },
  ETHUSD:  { precision: 2, increments: [0.05, 0.1, 0.5, 1, 2, 5, 10] },
  XRPUSD:  { precision: 4, increments: [0.0001, 0.0005, 0.001, 0.005, 0.01] },
  SOLUSD:  { precision: 4, increments: [0.0001, 0.0005, 0.001, 0.005, 0.01] },
  PAXGUSD: { precision: 2, increments: [0.05, 0.1, 0.5, 1, 2, 5, 10] },
  DOGEUSD: { precision: 6, increments: [0.000001, 0.000005, 0.00001, 0.00005, 0.0001] },
}
