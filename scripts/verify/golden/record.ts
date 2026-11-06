import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { GOLDEN_FIXTURES } from './model.ts'
import { readGoldenPdf } from './read.ts'

const root = path.resolve(import.meta.dirname, '../../..')

export function goldenRecordingPaths(outputRoot = path.join(root, 'out')) {
  return GOLDEN_FIXTURES.map((fixture) => ({
    fixture,
    source: path.join(outputRoot, path.relative('out', fixture.pdf)),
    destination: path.join(root, fixture.golden),
  }))
}

export async function recordGoldenPdfs(outputRoot?: string): Promise<void> {
  for (const { fixture, source, destination } of goldenRecordingPaths(outputRoot)) {
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, `${JSON.stringify(await readGoldenPdf(source), null, 2)}\n`)
    console.log(`recorded ${fixture.id}: ${fixture.golden}`)
  }
}

if (import.meta.main) await recordGoldenPdfs(process.argv[2] ? path.resolve(process.argv[2]) : undefined)
