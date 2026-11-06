import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { GOLDEN_FIXTURES } from './model.ts'
import { readGoldenPdf } from './read.ts'

const root = path.resolve(import.meta.dirname, '../../..')
for (const fixture of GOLDEN_FIXTURES) {
  const destination = path.join(root, fixture.golden)
  mkdirSync(path.dirname(destination), { recursive: true })
  writeFileSync(destination, `${JSON.stringify(await readGoldenPdf(path.join(root, fixture.pdf)), null, 2)}\n`)
  console.log(`recorded ${fixture.id}: ${fixture.golden}`)
}
