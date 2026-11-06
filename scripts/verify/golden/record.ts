import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { GOLDEN_FIXTURES, goldenFixturePath } from './model.ts'
import { REPOSITORY_ROOT } from './paths.ts'
import { readGoldenPdf } from './read.ts'
import { assertGoldenRecordable } from './record-policy.ts'

function goldenRecordingPaths(repositoryRoot: string, outputRoot: string) {
  return GOLDEN_FIXTURES.map((fixture) => ({
    fixture,
    source: path.join(outputRoot, fixture.pdf),
    destination: path.join(repositoryRoot, goldenFixturePath(fixture)),
  }))
}

export async function recordGoldenPdfs(repositoryRoot: string, outputRoot: string): Promise<void> {
  for (const { fixture, source, destination } of goldenRecordingPaths(repositoryRoot, outputRoot)) {
    const golden = await readGoldenPdf(source)
    assertGoldenRecordable(fixture.id, golden)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, `${JSON.stringify(golden, null, 2)}\n`)
    console.log(`recorded ${fixture.id}: ${goldenFixturePath(fixture)}`)
  }
  execFileSync(path.join(repositoryRoot, 'node_modules/.bin/biome'), ['format', '--write', path.join(repositoryRoot, 'scripts/verify/golden/fixtures')], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  })
}

if (import.meta.main) {
  const directory = process.argv[2]
  if (!directory) {
    throw new Error('An Ubuntu CI demo artifact directory is required; follow scripts/verify/golden/README.md to download and record it.')
  }
  await recordGoldenPdfs(REPOSITORY_ROOT, path.resolve(directory))
}
