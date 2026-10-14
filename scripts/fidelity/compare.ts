import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { OUTPUT_ROOT } from './config.ts'
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
const regionRows = [...leftRegions.entries()].flatMap(([key, before]) => {
  const after = rightRegions.get(key)
  if (!after) return []
  const [document, reader, name] = key.split('\u0000')
  return [
    {
      document,
      reader,
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
const comparison = { before: left.metadata, after: right.metadata, sizes: sizeRows, regions: regionRows }
await Bun.write(path.join(destination, 'compare.json'), `${JSON.stringify(comparison, null, 2)}\n`)
const markdown = `# Fidelity comparison\n\nBefore: **${left.metadata.label}** (\`${left.metadata.commit}\`)  \nAfter: **${right.metadata.label}** (\`${right.metadata.commit}\`)\n\n## PDF size\n\n| Document | Before | After | Change |\n|---|---:|---:|---:|\n${sizeRows.map((row) => `| ${row.document} | ${row.before} | ${row.after} | ${row.change >= 0 ? '+' : ''}${row.change} |`).join('\n')}\n\n## Regions\n\n| Document | Reader | Region | Mean before | Mean after | Change | P99 before | P99 after |\n|---|---|---|---:|---:|---:|---:|---:|\n${regionRows.map((row) => `| ${row.document} | ${row.reader} | ${row.name} | ${row.beforeMean.toFixed(2)} | ${row.afterMean.toFixed(2)} | ${row.meanChange >= 0 ? '+' : ''}${row.meanChange.toFixed(2)} | ${row.beforeP99} | ${row.afterP99} |`).join('\n')}\n`
await Bun.write(path.join(destination, 'compare.md'), markdown)
console.log(`Comparison report: ${path.join(destination, 'compare.md')}`)
