import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { OUTPUT_ROOT } from './config.ts'
import { regionKey } from './report.ts'
import type { FidelityRun } from './types.ts'

const decimal = (value: number | undefined): string => (value === undefined ? '—' : value.toFixed(2))
const verdict = (passed: boolean): string => (passed ? 'PASS' : 'FAIL')

function acceptance(run: FidelityRun) {
  const effects = run.documents.reduce(
    (worst, document) => ({
      mean: Math.max(worst.mean, document.bars.effects.measured?.mean ?? 0),
      p99: Math.max(worst.p99, document.bars.effects.measured?.p99 ?? 0),
    }),
    { mean: 0, p99: 0 },
  )
  const press = run.documents.reduce(
    (worst, document) => ({
      mean: Math.max(worst.mean, document.bars.pressColor.measured?.mean ?? 0),
      p99: Math.max(worst.p99, document.bars.pressColor.measured?.p99 ?? 0),
    }),
    { mean: 0, p99: 0 },
  )
  return {
    effects: { measured: effects, passed: run.documents.every((document) => document.bars.effects.passed) },
    pressColor: { measured: press, passed: run.documents.every((document) => document.bars.pressColor.passed) },
    size: {
      measured: {
        pdfBytes: Math.max(...run.documents.map((document) => document.pdfBytes), 0),
        effectlessPdfBytes: 0,
        multiple: Math.max(...run.documents.map((document) => document.bars.size.measured?.multiple ?? 0), 0),
      },
      passed: run.documents.every((document) => document.bars.size.passed),
    },
  }
}

function barCell(run: FidelityRun, document: FidelityRun['documents'][number] | undefined, bar: 'effects' | 'pressColor' | 'size'): string {
  const result = document?.bars[bar] ?? acceptance(run)[bar]
  const threshold = run.metadata.thresholds[bar]
  if (bar === 'size') {
    const measured = result.measured as { pdfBytes: number; effectlessPdfBytes: number; multiple: number } | undefined
    const limit = threshold as { multiple: number; absoluteBytes: number }
    if (!document)
      return `${verdict(result.passed)} largest ${measured?.pdfBytes.toLocaleString() ?? '—'} bytes, worst ${decimal(measured?.multiple)}× / ≤ ${limit.multiple}× and ≤ ${limit.absoluteBytes.toLocaleString()} bytes`
    return `${verdict(result.passed)} ${measured?.pdfBytes.toLocaleString() ?? '—'} / ${measured?.effectlessPdfBytes.toLocaleString() ?? '—'} = ${decimal(measured?.multiple)}× / ≤ ${limit.multiple}× and ≤ ${limit.absoluteBytes.toLocaleString()} bytes`
  }
  const measured = result.measured as { mean: number; p99: number } | undefined
  const limit = threshold as { mean: number; p99: number }
  return `${verdict(result.passed)} mean ${decimal(measured?.mean)}, p99 ${decimal(measured?.p99)} / mean ≤ ${limit.mean}, p99 ≤ ${limit.p99}`
}

function resolveRun(value: string): string {
  const direct = path.resolve(value)
  if (existsSync(path.join(direct, 'summary.json'))) return direct
  const named = path.join(OUTPUT_ROOT, value)
  if (existsSync(path.join(named, 'summary.json'))) return named
  throw new Error(`No fidelity run named ${value} was found.`)
}

const [leftArg, rightArg] = process.argv.slice(2)
if (!leftArg || !rightArg) throw new Error('Usage: bun run fidelity:compare <run-a> <run-b>')
const leftDirectory = resolveRun(leftArg)
const rightDirectory = resolveRun(rightArg)
const left = (await Bun.file(path.join(leftDirectory, 'summary.json')).json()) as FidelityRun
const right = (await Bun.file(path.join(rightDirectory, 'summary.json')).json()) as FidelityRun
const destination = path.join(OUTPUT_ROOT, `compare-${path.basename(leftDirectory)}-to-${path.basename(rightDirectory)}`)
mkdirSync(destination, { recursive: true })

const regionMap = (run: FidelityRun) =>
  new Map(
    run.documents.flatMap((document) =>
      document.readers.flatMap((reader) => (reader.regions ?? []).map((region) => [regionKey(document.id, reader.reader, region), region] as const)),
    ),
  )
const leftRegions = regionMap(left)
const rightRegions = regionMap(right)
const engineName = (name: string): string =>
  right.documents.flatMap((document) => document.readers).find((reader) => reader.reader === name)?.engine ??
  left.documents.flatMap((document) => document.readers).find((reader) => reader.reader === name)?.engine ??
  name
const regionRows = [...leftRegions.entries()].flatMap(([key, before]) => {
  const after = rightRegions.get(key)
  if (!after) return []
  const [document = '', reader = '', name = ''] = key.split('\u0000')
  return [
    {
      document,
      reader: engineName(reader),
      name,
      beforeMean: before.mean,
      afterMean: after.mean,
      meanChange: after.mean - before.mean,
      beforeP99: before.p99,
      afterP99: after.p99,
    },
  ]
})
const sizeRows = left.documents.flatMap((before) => {
  const after = right.documents.find((document) => document.id === before.id)
  return after ? [{ document: before.id, before: before.pdfBytes, after: after.pdfBytes, change: after.pdfBytes - before.pdfBytes }] : []
})
const comparison = {
  before: left.metadata,
  after: right.metadata,
  bars: { before: acceptance(left), after: acceptance(right) },
  sizes: sizeRows,
  regions: regionRows,
}
await Bun.write(path.join(destination, 'compare.json'), `${JSON.stringify(comparison, null, 2)}\n`)
const barRows = ['Total', ...left.documents.map((document) => document.id)].flatMap((id) => {
  const before = id === 'Total' ? undefined : left.documents.find((document) => document.id === id)
  const after = id === 'Total' ? undefined : right.documents.find((document) => document.id === id)
  if (id !== 'Total' && (!before || !after)) return []
  return [
    `| ${id} | ${barCell(left, before, 'effects')} → ${barCell(right, after, 'effects')} | ${barCell(left, before, 'pressColor')} → ${barCell(right, after, 'pressColor')} | ${barCell(left, before, 'size')} → ${barCell(right, after, 'size')} |`,
  ]
})
const markdown = `# Fidelity comparison\n\n## Acceptance bars\n\nEach cell is before → after; thresholds are printed beside the measured values.\n\n| Document | Effects | Press color | PDF size |\n|---|---|---|---|\n${barRows.join('\n')}\n\nBefore: **${left.metadata.label}** (\`${left.metadata.commit}\`)  \nAfter: **${right.metadata.label}** (\`${right.metadata.commit}\`)\n\n## PDF size\n\n| Document | Before | After | Change |\n|---|---:|---:|---:|\n${sizeRows.map((row) => `| ${row.document} | ${row.before} | ${row.after} | ${row.change >= 0 ? '+' : ''}${row.change} |`).join('\n')}\n\n## Regions\n\n| Document | Reader | Region | Mean before | Mean after | Change | P99 before | P99 after |\n|---|---|---|---:|---:|---:|---:|---:|\n${regionRows.map((row) => `| ${row.document} | ${row.reader} | ${row.name} | ${row.beforeMean.toFixed(2)} | ${row.afterMean.toFixed(2)} | ${row.meanChange >= 0 ? '+' : ''}${row.meanChange.toFixed(2)} | ${row.beforeP99} | ${row.afterP99} |`).join('\n')}\n`
await Bun.write(path.join(destination, 'compare.md'), markdown)
console.log(`Comparison report: ${path.join(destination, 'compare.md')}`)
