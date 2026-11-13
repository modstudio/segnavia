import { expect, test } from 'bun:test'
import { PREFLIGHT_SUBJECT_LIMIT, PX_PER_MM } from '@segnavia/format'
import { embeddedComposerInlineOverflowFunctions, inlineColumnSpan, inlineOverflowEntry, inlineOverflowMeasurement } from './composer-inline-overflow.ts'

test('measures ltr and rtl ink against the physical column edges', () => {
  expect(inlineColumnSpan({ left: 40, right: 240 }, 'ltr', 100)).toEqual({ left: 40, right: 140 })
  expect(inlineColumnSpan({ left: 40, right: 240 }, 'rtl', 100)).toEqual({ left: 140, right: 240 })
  expect(inlineOverflowMeasurement({ left: 40, right: 142 }, { left: 40, right: 140 }, PX_PER_MM)).toEqual({ columnWidthMm: 26.5, clippedMm: 0.5 })
  expect(inlineOverflowMeasurement({ left: 138, right: 240 }, { left: 140, right: 240 }, PX_PER_MM)).toEqual({ columnWidthMm: 26.5, clippedMm: 0.5 })
})

test('reports a margin-inset block and allows one pixel outside the column', () => {
  const column = { left: 10, right: 110 }
  expect(inlineOverflowMeasurement({ left: 60, right: 160 }, column, PX_PER_MM)?.clippedMm).toBe(13.2)
  expect(inlineOverflowMeasurement({ left: 9, right: 110 }, column, PX_PER_MM)).toBeUndefined()
  expect(inlineOverflowMeasurement({ left: 10, right: 111 }, column, PX_PER_MM)).toBeUndefined()
})

test('builds a bounded inline-overflow preflight entry from the resolved subject', () => {
  const entry = inlineOverflowEntry(
    { left: 0, right: 102 },
    { left: 0, right: 100 },
    'x'.repeat(PREFLIGHT_SUBJECT_LIMIT + 1),
    '12',
    PX_PER_MM,
    PREFLIGHT_SUBJECT_LIMIT,
  )
  expect(entry).toEqual({
    check: 'inline-overflow',
    subject: 'x'.repeat(PREFLIGHT_SUBJECT_LIMIT),
    message: '0.5mm of a block lies outside its 26.5mm column; narrow the block, let it wrap, or widen the column to clear this refusal',
    location: { folio: '12' },
  })
  expect(inlineOverflowEntry({ left: 0, right: 101 }, { left: 0, right: 100 }, 'notes div block 3', '', PX_PER_MM, PREFLIGHT_SUBJECT_LIMIT)).toBeUndefined()
})

test('embedded inline overflow functions take their scale and bound as inputs', () => {
  const embedded = new Function(`${embeddedComposerInlineOverflowFunctions()};return inlineOverflowEntry`)() as typeof inlineOverflowEntry
  expect(embedded({ left: 0, right: 102 }, { left: 0, right: 100 }, 'held', '2', PX_PER_MM, PREFLIGHT_SUBJECT_LIMIT)?.check).toBe('inline-overflow')
})
