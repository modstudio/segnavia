import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DRAWING_INPUTS } from '../architecture.ts'
import { COVER_DRAWING_VERSION, IMAGE_DRAWING_VERSION } from '../packages/format/src/index.ts'
import { NO_NETWORK_ARGS } from '../packages/render/src/no-network-args.ts'
import type { DrawingInputRecord, DrawingInputState } from './checks/drawing-inputs.ts'
import { drawingInputFingerprint } from './drawing-input-fingerprint.ts'

export const DRAWING_INPUTS_RECORD = 'drawing-inputs.json'

interface RenderManifest {
  devDependencies: { 'playwright-core': string }
}

export function currentDrawingInputRecord(root: string): DrawingInputRecord {
  const manifest = JSON.parse(readFileSync(path.join(root, 'packages/render/package.json'), 'utf8')) as RenderManifest
  const files = DRAWING_INPUTS.map((inputPath) => ({ path: inputPath, text: readFileSync(path.join(root, inputPath), 'utf8') }))
  return {
    image: IMAGE_DRAWING_VERSION,
    cover: COVER_DRAWING_VERSION,
    fingerprint: drawingInputFingerprint({ files, playwrightCore: manifest.devDependencies['playwright-core'], noNetworkArgs: NO_NETWORK_ARGS }),
  }
}

export function readDrawingInputRecord(root: string): DrawingInputRecord {
  return JSON.parse(readFileSync(path.join(root, DRAWING_INPUTS_RECORD), 'utf8')) as DrawingInputRecord
}

export function drawingInputState(root: string, changedFiles: readonly string[]): DrawingInputState {
  return {
    ...currentDrawingInputRecord(root),
    changedFiles: changedFiles.filter((file) => DRAWING_INPUTS.includes(file as (typeof DRAWING_INPUTS)[number]) || file === 'packages/render/package.json'),
  }
}
