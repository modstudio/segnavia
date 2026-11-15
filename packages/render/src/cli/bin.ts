import { openRenderer } from '../index.ts'
import { readRenderInput } from './input.ts'
import { outcomeFromError, RENDER_REQUEST_BYTES, type RenderOutcome } from './protocol.ts'
import { runRenderRequest } from './run.ts'

const environment = {
  SEGNAVIA_CHROMIUM: process.env.SEGNAVIA_CHROMIUM,
  SEGNAVIA_CHROMIUM_CONTAINER: process.env.SEGNAVIA_CHROMIUM_CONTAINER,
  SEGNAVIA_FONTS: process.env.SEGNAVIA_FONTS,
}
let outcome: RenderOutcome
try {
  outcome = await runRenderRequest(await readRenderInput(process.stdin, RENDER_REQUEST_BYTES), environment, openRenderer)
} catch (error) {
  outcome = outcomeFromError(error)
}
if (outcome.stdout.byteLength > 0) process.stdout.write(outcome.stdout)
if (outcome.stderr) process.stderr.write(outcome.stderr)
process.exitCode = outcome.exitCode
