import { describe, expect, test } from 'bun:test'
import { changedDrawingInputPaths, drawingInputRecord, drawingInputSources, parseDrawingInputRecord } from './drawing-input-state.ts'

const valid = JSON.stringify({ image: 1, cover: 1, fingerprint: 'a'.repeat(64) })

describe('drawing input state', () => {
  test('validates the committed record shape', () => {
    expect(parseDrawingInputRecord(valid)).toEqual({ image: 1, cover: 1, fingerprint: 'a'.repeat(64) })
    expect(() => parseDrawingInputRecord('{')).toThrow(/drawing-inputs\.json is missing or malformed.*drawing:record/)
    expect(() => parseDrawingInputRecord(JSON.stringify({ image: 1, cover: 1, fingerprint: 'short' }))).toThrow(/fingerprint must be a lowercase sha256/)
  })

  test('names a missing committed record and its remedy', () => {
    expect(() =>
      drawingInputRecord(() => {
        throw new Error('ENOENT')
      }),
    ).toThrow(/drawing-inputs\.json is missing or malformed.*ENOENT.*drawing:record/)
  })

  test('names a missing declared source and its remedy', () => {
    expect(() =>
      drawingInputSources(['missing.ts'], () => {
        throw new Error('ENOENT')
      }),
    ).toThrow(/declared drawing input missing\.ts.*ENOENT.*restore it or update DRAWING_INPUTS/)
  })

  test('falls back to generic changed-input wording when merge-base lookup fails', () => {
    const result = changedDrawingInputPaths(() => {
      throw new Error('Could not find the merge base with origin/main.')
    })
    expect(result.paths).toEqual([])
    expect(result.failure).toMatch(/could not establish which drawing inputs changed.*restore the origin\/main merge base/)
  })
})
