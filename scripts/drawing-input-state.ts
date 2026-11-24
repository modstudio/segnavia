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

function recordError(reason: unknown): Error {
  return new Error(
    `${DRAWING_INPUTS_RECORD} is missing or malformed (${reason instanceof Error ? reason.message : String(reason)}); run bun run drawing:record to clear this finding.`,
  )
}

export function parseDrawingInputRecord(text: string): DrawingInputRecord {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw recordError(error)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw recordError('expected an object')
  const { image, cover, fingerprint } = value as Partial<DrawingInputRecord>
  if (!Number.isInteger(image) || (image as number) <= 0) throw recordError('image must be a positive integer')
  if (!Number.isInteger(cover) || (cover as number) <= 0) throw recordError('cover must be a positive integer')
  if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) throw recordError('fingerprint must be a lowercase sha256')
  return { image: image as number, cover: cover as number, fingerprint }
}

export function drawingInputRecord(read: () => string): DrawingInputRecord {
  try {
    return parseDrawingInputRecord(read())
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${DRAWING_INPUTS_RECORD} is missing or malformed`)) throw error
    throw recordError(error)
  }
}

export function drawingInputSources(inputs: readonly string[], read: (source: string) => string): Array<{ path: string; text: string }> {
  return inputs.map((inputPath) => {
    try {
      return { path: inputPath, text: read(inputPath) }
    } catch (error) {
      throw new Error(
        `the declared drawing input ${inputPath} is missing or unreadable (${error instanceof Error ? error.message : String(error)}); restore it or update DRAWING_INPUTS to clear this finding.`,
      )
    }
  })
}

export function changedDrawingInputPaths(readChangedFiles: () => string[]): { paths: string[]; failure?: string } {
  try {
    return { paths: readChangedFiles() }
  } catch (error) {
    return {
      paths: [],
      failure: `could not establish which drawing inputs changed (${error instanceof Error ? error.message : String(error)}); restore the origin/main merge base to name them.`,
    }
  }
}

export function currentDrawingInputRecord(root: string): DrawingInputRecord {
  const manifest = JSON.parse(readFileSync(path.join(root, 'packages/render/package.json'), 'utf8')) as RenderManifest
  const files = drawingInputSources(DRAWING_INPUTS, (inputPath) => readFileSync(path.join(root, inputPath), 'utf8'))
  return {
    image: IMAGE_DRAWING_VERSION,
    cover: COVER_DRAWING_VERSION,
    fingerprint: drawingInputFingerprint({ files, playwrightCore: manifest.devDependencies['playwright-core'], noNetworkArgs: NO_NETWORK_ARGS }),
  }
}

export function readDrawingInputRecord(root: string): DrawingInputRecord {
  return drawingInputRecord(() => readFileSync(path.join(root, DRAWING_INPUTS_RECORD), 'utf8'))
}

export function drawingInputState(root: string, changedFiles: readonly string[]): DrawingInputState {
  return {
    ...currentDrawingInputRecord(root),
    changedFiles: changedFiles.filter((file) => DRAWING_INPUTS.includes(file as (typeof DRAWING_INPUTS)[number]) || file === 'packages/render/package.json'),
  }
}
