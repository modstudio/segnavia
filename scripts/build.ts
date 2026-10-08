// Builds every installable artifact.

import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

async function run(command: string[]): Promise<void> {
  const process = Bun.spawn(command, { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' })
  if ((await process.exited) !== 0) throw new Error(`${command.join(' ')} failed.`)
}

await run(['bunx', 'tsdown'])
await run(['bunx', 'tsdown', '--config', 'tsdown.browser.config.ts'])
