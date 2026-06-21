export const SYMBOLS = ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'PAXGUSD', 'DOGEUSD'] as const
export type Symbol = typeof SYMBOLS[number]

export function isSymbol(v: string): v is Symbol {
  return (SYMBOLS as readonly string[]).includes(v)
}

export const SYMBOL_CONFIG: Record<Symbol, {
  precision: number
  increments: number[]
  largeTradeThreshold: number
}> = {
  // largeTradeThreshold: ~40-50% of mid notional (price × size ≈ 96–105)
  // so roughly half of trades show as large based on price variation
  BTCUSD:  { precision: 1, increments: [0.5, 1, 2, 5, 10, 25, 50, 100],                  largeTradeThreshold: 3_000_000 },
  ETHUSD:  { precision: 2, increments: [0.05, 0.1, 0.5, 1, 2, 5, 10],                    largeTradeThreshold: 100_000   },
  XRPUSD:  { precision: 4, increments: [0.0001, 0.0005, 0.001, 0.005, 0.01],             largeTradeThreshold: 100       },
  SOLUSD:  { precision: 4, increments: [0.0001, 0.0005, 0.001, 0.005, 0.01],             largeTradeThreshold: 4_000     },
  PAXGUSD: { precision: 2, increments: [0.05, 0.1, 0.5, 1, 2, 5, 10],                    largeTradeThreshold: 250_000   },
  DOGEUSD: { precision: 6, increments: [0.000001, 0.000005, 0.00001, 0.00005, 0.0001],   largeTradeThreshold: 2         },
}
