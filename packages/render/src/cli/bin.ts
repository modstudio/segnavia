import { buffer } from 'node:stream/consumers'
import { openRenderer } from '../index.ts'
import { runRenderRequest } from './run.ts'

const outcome = await runRenderRequest(new Uint8Array(await buffer(process.stdin)), process.env, openRenderer)
if (outcome.stdout.byteLength > 0) process.stdout.write(outcome.stdout)
if (outcome.stderr) process.stderr.write(outcome.stderr)
process.exitCode = outcome.exitCode
