import { describe, expect, test } from 'bun:test'
import { checkDrawingInputs, drawingBumpStatus, recordDrawingInputs } from './drawing-inputs.ts'

const record = { image: 1, cover: 1, fingerprint: 'old' }

describe('drawing input check', () => {
  test('accepts an unchanged fingerprint and versions', () => {
    expect(checkDrawingInputs(record, { ...record, changedFiles: [] })).toEqual([])
  })

  test('names changed files and both versions when an input changes without a bump', () => {
    expect(checkDrawingInputs(record, { ...record, fingerprint: 'new', changedFiles: ['packages/render/src/capture-image.ts'] })).toEqual([
      expect.stringContaining('packages/render/src/capture-image.ts'),
    ])
    expect(checkDrawingInputs(record, { ...record, fingerprint: 'new', changedFiles: [] })[0]).toContain(
      'raise IMAGE_DRAWING_VERSION and COVER_DRAWING_VERSION',
    )
  })

  test('refuses a raised version with a stale record', () => {
    expect(checkDrawingInputs(record, { image: 2, cover: 2, fingerprint: 'new', changedFiles: [] })).toEqual([
      'drawing versions changed without updating drawing-inputs.json; run bun run drawing:record.',
    ])
  })

  test('recording refuses a one-sided bump when inputs changed', () => {
    expect(() => recordDrawingInputs(record, { image: 2, cover: 1, fingerprint: 'new' })).toThrow('raise IMAGE_DRAWING_VERSION and COVER_DRAWING_VERSION')
  })

  test('uses one bump predicate for checking and recording', () => {
    expect(drawingBumpStatus(record, record)).toBe('current')
    expect(drawingBumpStatus(record, { image: 2, cover: 2, fingerprint: 'new' })).toBe('needs-record')
    expect(drawingBumpStatus(record, { ...record, fingerprint: 'new' })).toBe('needs-bump')
  })
})
