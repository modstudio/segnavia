import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { barCell, totalBars } from './bars.ts'
import { ACCEPTANCE_BARS, OUTPUT_ROOT } from './config.ts'
import { regionKey } from './report.ts'
import type { FidelityRun } from './types.ts'

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
const grayPressRows = left.documents.flatMap((before) => {
  const after = right.documents.find((document) => document.id === before.id)
  if (!after) return []
  return [
    {
      document: before.id,
      before: before.grayPressDifference,
      after: after.grayPressDifference,
      beforeResidues: before.grayPressResidues,
      afterResidues: after.grayPressResidues,
    },
  ]
})
const comparison = {
  before: left.metadata,
  after: right.metadata,
  bars: { before: totalBars(left.documents), after: totalBars(right.documents) },
  sizes: sizeRows,
  grayPress: grayPressRows,
  regions: regionRows,
}
await Bun.write(path.join(destination, 'compare.json'), `${JSON.stringify(comparison, null, 2)}\n`)
const barRows = ['Total', ...left.documents.map((document) => document.id)].flatMap((id) => {
  const before = id === 'Total' ? undefined : left.documents.find((document) => document.id === id)
  const after = id === 'Total' ? undefined : right.documents.find((document) => document.id === id)
  if (id !== 'Total' && (!before || !after)) return []
  const beforeBars = before?.bars ?? totalBars(left.documents)
  const afterBars = after?.bars ?? totalBars(right.documents)
  return [
    `| ${id} | ${ACCEPTANCE_BARS.map((bar) => `${barCell(beforeBars[bar.id], bar.id, !before)} → ${barCell(afterBars[bar.id], bar.id, !after)}`).join(' | ')} |`,
  ]
})
const barHeader = ACCEPTANCE_BARS.map((bar) => bar.title).join(' | ')
const barDivider = ACCEPTANCE_BARS.map(() => '---').join('|')
const grayDifference = (value: { mean: number; p99: number } | undefined): string => (value ? `${value.mean.toFixed(2)} / ${value.p99}` : 'SKIP')
const markdown = `# Fidelity comparison\n\n## Acceptance bars\n\nEach cell is before → after; thresholds are printed beside the measured values.\n\n| Document | ${barHeader} |\n|---|${barDivider}|\n${barRows.join('\n')}\n\nBefore: **${left.metadata.label}** (\`${left.metadata.commit}\`)  \nAfter: **${right.metadata.label}** (\`${right.metadata.commit}\`)\n\n## Gray press\n\nDifferences are mean / p99; residue counts are before → after.\n\n| Document | Difference before | Difference after | Residues |\n|---|---:|---:|---:|\n${grayPressRows.map((row) => `| ${row.document} | ${grayDifference(row.before)} | ${grayDifference(row.after)} | ${row.beforeResidues ?? '—'} → ${row.afterResidues ?? '—'} |`).join('\n')}\n\n## PDF size\n\n| Document | Before | After | Change |\n|---|---:|---:|---:|\n${sizeRows.map((row) => `| ${row.document} | ${row.before} | ${row.after} | ${row.change >= 0 ? '+' : ''}${row.change} |`).join('\n')}\n\n## Regions\n\n| Document | Reader | Region | Mean before | Mean after | Change | P99 before | P99 after |\n|---|---|---|---:|---:|---:|---:|---:|\n${regionRows.map((row) => `| ${row.document} | ${row.reader} | ${row.name} | ${row.beforeMean.toFixed(2)} | ${row.afterMean.toFixed(2)} | ${row.meanChange >= 0 ? '+' : ''}${row.meanChange.toFixed(2)} | ${row.beforeP99} | ${row.afterP99} |`).join('\n')}\n`
await Bun.write(path.join(destination, 'compare.md'), markdown)
console.log(`Comparison report: ${path.join(destination, 'compare.md')}`)
