import { describe, expect, test } from 'bun:test'
import { drawingInputFingerprint } from './drawing-input-fingerprint.ts'

const input = {
  files: [
    { path: 'b.ts', text: 'second' },
    { path: 'a.ts', text: 'first' },
  ],
  playwrightCore: '1.2.3',
  noNetworkArgs: ['--offline'],
}

describe('drawing input fingerprint', () => {
  test('is stable across source order', () => {
    expect(drawingInputFingerprint(input)).toBe(drawingInputFingerprint({ ...input, files: [...input.files].reverse() }))
  })

  test.each([
    {
      ...input,
      files: [
        { path: 'a.ts', text: 'changed' },
        { path: 'b.ts', text: 'second' },
      ],
    },
    { ...input, playwrightCore: '1.2.4' },
    { ...input, noNetworkArgs: ['--different'] },
  ])('changes when a drawing input changes', (changed) => {
    expect(drawingInputFingerprint(changed)).not.toBe(drawingInputFingerprint(input))
  })
})
