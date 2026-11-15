import { buffer } from 'node:stream/consumers'
import { openRenderer } from '../index.ts'
import { runRenderRequest } from './run.ts'

const outcome = await runRenderRequest(
  new Uint8Array(await buffer(process.stdin)),
  {
    SEGNAVIA_CHROMIUM: process.env.SEGNAVIA_CHROMIUM,
    SEGNAVIA_CHROMIUM_CONTAINER: process.env.SEGNAVIA_CHROMIUM_CONTAINER,
    SEGNAVIA_FONTS: process.env.SEGNAVIA_FONTS,
  },
  openRenderer,
)
if (outcome.stdout.byteLength > 0) process.stdout.write(outcome.stdout)
if (outcome.stderr) process.stderr.write(outcome.stderr)
process.exitCode = outcome.exitCode
