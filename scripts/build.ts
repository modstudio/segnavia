// Builds every installable artifact.

import { copyFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PACKAGES } from '../architecture.ts'

const ROOT = path.resolve(import.meta.dirname, '..')

async function run(command: string[]): Promise<void> {
  const process = Bun.spawn(command, { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' })
  if ((await process.exited) !== 0) throw new Error(`${command.join(' ')} failed.`)
}

await run(['bunx', 'tsdown'])
const { diagramProviderScript } = await import('../packages/diagrams/src/script.ts')
writeFileSync(path.join(ROOT, 'packages/diagrams/dist/script.js'), `export const diagramProviderScript=${JSON.stringify(diagramProviderScript)};\n`)
await run(['bunx', 'tsdown', '--config', 'tsdown.browser.config.ts'])
for (const name of Object.keys(PACKAGES)) copyFileSync(path.join(ROOT, 'LICENSE'), path.join(ROOT, 'packages', name, 'LICENSE'))
