/**
 * Pipeline performance benchmark
 *
 * Simulates stress-rate flush cycles using real pipeline functions on synthetic
 * data, then appends a timestamped report to benchmark-results.log.
 *
 * Run:  npm run bench
 *       BENCH_DURATION_S=20 npm run bench        (longer run)
 *       THROTTLE_X=6 npm run bench               (simulate 6× CPU throttle)
 *       THROTTLE_X=6 BENCH_DURATION_S=20 npm run bench
 *
 * THROTTLE_X models a slower CPU accurately per pipeline type:
 *   - OB:      parse N buffered snapshots, aggregate only the latest (real behaviour)
 *   - Trades:  aggregate N× more messages (all buffered messages get aggregated)
 *   - Tickers: merge N× more messages (same)
 */

import { it } from 'vitest'
import { execSync } from 'child_process'
import { appendFileSync } from 'fs'
import { join } from 'path'

import { aggregateOrderBook } from '../src/pipelines/orderBookPipeline'
import { aggregateTrades, type AggregatedTrade } from '../src/pipelines/tradePipeline'
import { mergeLatestTickers } from '../src/pipelines/tickerPipeline'
import { parseOrderBookMessage, parseTradeMessage, parseTickerMessage } from '../src/pipelines/parsers'
import { SYMBOLS, type Symbol } from '../src/config/symbols'

// ── Configuration ─────────────────────────────────────────────────────────

const DURATION_MS        = (Number(process.env.BENCH_DURATION_S) || 15) * 1_000
const THROTTLE_X         = Math.max(1, Math.round(Number(process.env.THROTTLE_X) || 1))
const LOG_FILE           = join(process.cwd(), 'benchmark-results.log')
const SYMBOL: Symbol     = 'BTCUSD'
const INCREMENT          = 0.5

// Base stress-profile volumes (×1 — no throttle)
// l2_orderbook: min:10 max:20ms → ~5 snapshots per 50ms flush
// all_trades:   min:1  max:5ms  → ~50 trades per 100ms flush
// v2/ticker:    min:10 max:20ms → ~18 messages per 200ms flush (6 symbols × 3)
const OB_LEVELS_PER_SIDE     = 500
const BASE_TRADES_PER_FLUSH  = 50
const BASE_TICKERS_PER_FLUSH = 18
const NOTIONAL_THRESHOLD     = 50_000

// Actual volumes for this run (scaled by THROTTLE_X for trades/tickers)
const TRADES_PER_FLUSH  = BASE_TRADES_PER_FLUSH  * THROTTLE_X
const TICKERS_PER_FLUSH = BASE_TICKERS_PER_FLUSH * THROTTLE_X

// Budget thresholds from CLAUDE.md (ms, checked at p95)
const BUDGET = { ob: 2, trades: 3, ticker: 0.5 }

// ── Synthetic data generators ──────────────────────────────────────────────

function makeRawOB(): Record<string, unknown> {
  const base = 62_000 + Math.random() * 50
  const bids: [string, string][] = Array.from({ length: OB_LEVELS_PER_SIDE }, (_, i) => [
    (base - i * 0.1).toFixed(1),
    (Math.random() * 5 + 0.01).toFixed(4),
  ])
  const asks: [string, string][] = Array.from({ length: OB_LEVELS_PER_SIDE }, (_, i) => [
    (base + 0.1 + i * 0.1).toFixed(1),
    (Math.random() * 5 + 0.01).toFixed(4),
  ])
  return { symbol: SYMBOL, bids, asks, timestamp: Date.now() * 1_000 }
}

function makeRawTrades(count: number): Record<string, unknown>[] {
  const nowUs = Date.now() * 1_000
  return Array.from({ length: count }, (_, i) => ({
    symbol:      SYMBOL,
    price:       String((62_000 + Math.random() * 200).toFixed(1)),
    size:        Math.random() * 2 + 0.001,
    buyer_role:  Math.random() > 0.5 ? 'taker' : 'maker',
    seller_role: Math.random() > 0.5 ? 'taker' : 'maker',
    timestamp:   nowUs - i * 2_000,
  }))
}

function makeRawTickers(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    symbol:         SYMBOLS[i % SYMBOLS.length],
    close:          62_000 + Math.random() * 100,
    ltp_change_24h: String((0.98 + Math.random() * 0.04).toFixed(6)),
  }))
}

// ── Statistics ─────────────────────────────────────────────────────────────

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(Math.ceil((p / 100) * sorted.length) - 1, sorted.length - 1)]
}

interface PipelineStats {
  n: number; mean: number; p50: number; p95: number; p99: number; max: number
}

function computeStats(t: number[]): PipelineStats {
  if (t.length === 0) return { n: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 }
  const s = [...t].sort((a, b) => a - b)
  return {
    n:    t.length,
    mean: t.reduce((acc, v) => acc + v, 0) / t.length,
    p50:  pct(s, 50),
    p95:  pct(s, 95),
    p99:  pct(s, 99),
    max:  s[s.length - 1],
  }
}

// ── Report formatting ──────────────────────────────────────────────────────

const W       = 82
const DIVIDER = '═'.repeat(W)
const THIN    = '─'.repeat(W)

function f(n: number): string { return `${n.toFixed(3)}ms`.padStart(10) }

function budgetLine(label: string, val: number, budget: number): string {
  return val <= budget
    ? `    ${label.padEnd(18)}: ✓  p95 ${val.toFixed(3)}ms ≤ ${budget}ms`
    : `    ${label.padEnd(18)}: ⚠  p95 ${val.toFixed(3)}ms > ${budget}ms budget`
}

function tableRow(label: string, s: PipelineStats): string {
  return `  ${label.padEnd(32)} ${String(s.n).padStart(4)}  ${f(s.mean)}  ${f(s.p50)}  ${f(s.p95)}  ${f(s.p99)}  ${f(s.max)}`
}

function formatReport(
  ob: PipelineStats, parse: PipelineStats,
  trades: PipelineStats, ticker: PipelineStats,
  gitHash: string,
): string {
  const throttleNote = THROTTLE_X > 1
    ? `  CPU throttle   : ×${THROTTLE_X} simulation (${THROTTLE_X}× buffered msgs — OB parse ×${THROTTLE_X}, trades ×${THROTTLE_X}, tickers ×${THROTTLE_X})`
    : `  CPU throttle   : none (baseline)`

  const obCost     = ob.mean     * (1_000 / 50)
  const tradeCost  = trades.mean * (1_000 / 100)
  const tickerCost = ticker.mean * (1_000 / 200)
  const totalCost  = obCost + tradeCost + tickerCost

  const recommendation =
    totalCost > 100
      ? `  ⚠  ${totalCost.toFixed(0)}ms/s pipeline load — Issue 20 (Web Worker) strongly advised.`
      : totalCost > 30
      ? `  ⚡  ${totalCost.toFixed(0)}ms/s pipeline load — within range; monitor under real load.`
      : `  ✓  ${totalCost.toFixed(0)}ms/s pipeline load — well within budget.`

  const obParseLabel  = THROTTLE_X > 1 ? `OB JSON.parse (×${THROTTLE_X} msgs)`  : 'OB JSON.parse only'
  const obAggLabel    = THROTTLE_X > 1 ? 'OB aggregate (latest msg)'             : 'OB aggregate (50ms cycle)'
  const tradesLabel   = THROTTLE_X > 1 ? `Trades flush (×${THROTTLE_X} msgs)`    : 'Trades flush (100ms)'
  const tickersLabel  = THROTTLE_X > 1 ? `Ticker flush (×${THROTTLE_X} msgs)`    : 'Ticker flush (200ms)'

  return [
    '',
    DIVIDER,
    `  Benchmark Run  : ${new Date().toISOString()}`,
    `  Commit         : ${gitHash}`,
    `  Duration       : ${DURATION_MS / 1_000}s  |  Stress profile — ${OB_LEVELS_PER_SIDE} OB levels/side`,
    throttleNote,
    DIVIDER,
    '',
    `  ${'Pipeline'.padEnd(32)} ${'n'.padStart(4)}  ${'mean'.padStart(10)}  ${'p50'.padStart(10)}  ${'p95'.padStart(10)}  ${'p99'.padStart(10)}  ${'max'.padStart(10)}`,
    THIN,
    tableRow(obAggLabel,   ob),
    tableRow(obParseLabel, parse),
    tableRow(tradesLabel,  trades),
    tableRow(tickersLabel, ticker),
    THIN,
    '',
    '  Budget check (p95 vs CLAUDE.md thresholds):',
    budgetLine('OB aggregate', ob.p95,     BUDGET.ob),
    budgetLine('Trades flush', trades.p95, BUDGET.trades),
    budgetLine('Ticker flush', ticker.p95, BUDGET.ticker),
    '',
    '  Main-thread pipeline cost/second (extrapolated):',
    `    OB      : ${obCost.toFixed(0).padStart(4)}ms/s  (${ob.mean.toFixed(3)}ms × ${1_000 / 50} flushes/s)`,
    `    Trades  : ${tradeCost.toFixed(0).padStart(4)}ms/s  (${trades.mean.toFixed(3)}ms × ${1_000 / 100} flushes/s)`,
    `    Ticker  : ${tickerCost.toFixed(0).padStart(4)}ms/s  (${ticker.mean.toFixed(3)}ms × ${1_000 / 200} flushes/s)`,
    `    Total   : ${totalCost.toFixed(0).padStart(4)}ms/s  (${(totalCost / 10).toFixed(1)}% of available CPU)`,
    '',
    '  Recommendation:',
    recommendation,
    '',
    DIVIDER,
    '',
  ].join('\n')
}

// ── Benchmark ──────────────────────────────────────────────────────────────

const testName = THROTTLE_X > 1
  ? `pipeline flush timing — ${DURATION_MS / 1_000}s @ ×${THROTTLE_X} CPU throttle`
  : `pipeline flush timing — ${DURATION_MS / 1_000}s stress profile`

it(testName, async () => {
  const obTimings:    number[] = []
  const parseTimings: number[] = []
  const tradeTimings: number[] = []
  const tickerTimings:number[] = []

  let existingTrades: AggregatedTrade[] = []
  let tick = 0
  const deadline = Date.now() + DURATION_MS

  while (Date.now() < deadline) {
    tick++
    const cycleStart = performance.now()

    // ── OB flush — every tick (50ms) ─────────────────────────────────────
    // Parse THROTTLE_X buffered snapshots (all arrive between flushes on slow CPU).
    // Aggregate only the latest — matches real useOrderBookFlush behaviour.
    const rawOBStrings = Array.from({ length: THROTTLE_X }, () => JSON.stringify(makeRawOB()))

    let t0 = performance.now()
    const parsedMsgs = rawOBStrings.map(s => JSON.parse(s) as Record<string, unknown>)
    parseTimings.push(performance.now() - t0)

    t0 = performance.now()
    const latestOB = parseOrderBookMessage(parsedMsgs[parsedMsgs.length - 1])
    aggregateOrderBook(latestOB.bids, latestOB.asks, INCREMENT, SYMBOL)
    obTimings.push(performance.now() - t0)

    // ── Trades flush — every 2nd tick (100ms) ────────────────────────────
    // All THROTTLE_X × messages must be aggregated (none can be skipped).
    if (tick % 2 === 0) {
      t0 = performance.now()
      const raw = makeRawTrades(TRADES_PER_FLUSH)
      const parsed = raw.map(r => parseTradeMessage(r))
      existingTrades = aggregateTrades(parsed, existingTrades, NOTIONAL_THRESHOLD)
      tradeTimings.push(performance.now() - t0)
    }

    // ── Ticker flush — every 4th tick (200ms) ────────────────────────────
    if (tick % 4 === 0) {
      t0 = performance.now()
      const parsed = makeRawTickers(TICKERS_PER_FLUSH).map(r => parseTickerMessage(r))
      mergeLatestTickers(parsed)
      tickerTimings.push(performance.now() - t0)
    }

    // Pace loop to real time — sleep the remaining portion of the 50ms slot
    const elapsed = performance.now() - cycleStart
    if (elapsed < 50) await new Promise(r => setTimeout(r, 50 - elapsed))
  }

  // ── Compute + write report ───────────────────────────────────────────────
  const obStats     = computeStats(obTimings)
  const parseStats  = computeStats(parseTimings)
  const tradeStats  = computeStats(tradeTimings)
  const tickerStats = computeStats(tickerTimings)

  const gitHash = execSync('git rev-parse --short HEAD', { cwd: process.cwd() }).toString().trim()
  const report  = formatReport(obStats, parseStats, tradeStats, tickerStats, gitHash)

  appendFileSync(LOG_FILE, report)
  process.stdout.write(report)
  process.stdout.write(`  → Appended to ${LOG_FILE}\n\n`)

}, DURATION_MS + 15_000)
