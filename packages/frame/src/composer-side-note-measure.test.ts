import { expect, test } from 'bun:test'
import { sideNoteAnchorTop } from './composer-side-note-measure.ts'

test('side-note anchors use the following text line for blocks and their containing line inline', () => {
  const first = { top: 10, bottom: 20 }
  const second = { top: 20, bottom: 30 }
  const held = [first, second]
  expect(
    sideNoteAnchorTop(
      'block',
      4,
      [],
      [
        { kind: 'heading', lines: held },
        { kind: 'text', lines: [{ ...first, counted: false }, second] },
      ],
    ),
  ).toBe(20)
  expect(sideNoteAnchorTop('block', 4, [], [])).toBe(4)
  expect(sideNoteAnchorTop('inline', 24, held, [])).toBe(20)
})
