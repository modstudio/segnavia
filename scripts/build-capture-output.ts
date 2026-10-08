// Builds deterministic capture-output facts for the browser verifier: pixel
// scale, WebP quality fallback, and refusal below every offered quality.

import './source-guard.ts'
import { rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { capture, type Flow, type Host } from '@segnavia/capture'

const flow: Flow<Record<string, never>> = {
  name: 'output',
  async run(context) {
    await context.step('open the output fixture', () => context.goto('/'))
    await context.shot({ key: 'output.sample', title: 'Output sample' })
  },
}
const host: Host<Record<string, never>> = { open: async () => ({}) }

export async function buildCaptureOutputFacts(baseUrl: string, out: string, executablePath: string) {
  const directory = (name: string) => path.join(out, `capture-${name}`)
  const run = async (name: string, format: 'png' | 'webp', quality: number[], maxBytes?: number, scale = 1) =>
    capture(host, [flow], {
      baseUrl,
      outputDirectory: directory(name),
      executablePath,
      viewport: { width: 320, height: 200 },
      scale,
      output: { format, quality, maxBytes },
    })
  const quality90 = await run('quality-90', 'webp', [90])
  const quality80 = await run('quality-80', 'webp', [80])
  const bytes90 = statSync(path.join(directory('quality-90'), 'output.sample.webp')).size
  const bytes80 = statSync(path.join(directory('quality-80'), 'output.sample.webp')).size
  const ceiling = Math.floor((bytes90 + bytes80) / 2)
  const fallback = await run('fallback', 'webp', [90, 80], ceiling)
  const fallbackBytes = statSync(path.join(directory('fallback'), 'output.sample.webp')).size
  const tooSmall = await run('too-small', 'webp', [90, 80], 1)
  const scalePng = await run('scale-png', 'png', [], undefined, 2)
  for (const name of ['quality-90', 'quality-80', 'fallback', 'too-small']) rmSync(directory(name), { recursive: true, force: true })
  return {
    bytes90,
    bytes80,
    ceiling,
    fallbackBytes,
    referencesOk: quality90.ok && quality80.ok,
    fallbackOk: fallback.ok,
    scalePngOk: scalePng.ok,
    tooSmall: tooSmall.results[0],
  }
}
