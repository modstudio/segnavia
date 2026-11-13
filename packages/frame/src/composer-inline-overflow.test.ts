import { expect, test } from 'bun:test'
import { PREFLIGHT_SUBJECT_LIMIT, PX_PER_MM } from '@segnavia/format'
import { embeddedComposerInlineOverflowFunctions, inlineOverflowEntry, inlineOverflowExtent, inlineOverflowMeasurement } from './composer-inline-overflow.ts'

test('allows one pixel of inline overflow and reports two pixels', () => {
  expect(inlineOverflowMeasurement(101, 100)).toBeUndefined()
  expect(inlineOverflowMeasurement(102, 100)).toEqual({ extentMm: 27, columnWidthMm: 26.5, clippedMm: 0.5 })
})

test('reports the inline extent and clipped excess in millimeters', () => {
  expect(inlineOverflowMeasurement(412.3 * (96 / 25.4), 160 * (96 / 25.4))).toEqual({
    extentMm: 412.3,
    columnWidthMm: 160,
    clippedMm: 252.3,
  })
})

test('uses the flow writing mode for the logical inline axis', () => {
  const rect = { width: 100, height: 202 }
  expect(inlineOverflowMeasurement(inlineOverflowExtent(rect, 'horizontal-tb', { inline: 0 }), 200)).toBeUndefined()
  expect(inlineOverflowMeasurement(inlineOverflowExtent(rect, 'vertical-rl', { inline: 0 }), 200)?.clippedMm).toBe(0.5)
})

test('adds descendant, scroll and decoration ink beyond the block box', () => {
  expect(inlineOverflowExtent({ width: 100, height: 50 }, 'horizontal-tb', { inline: 12 })).toBe(112)
})

test('builds a bounded inline-overflow preflight entry', () => {
  const entry = inlineOverflowEntry(102, 100, [null, 'x'.repeat(PREFLIGHT_SUBJECT_LIMIT + 1)], 'chapter', 'p', 3, '12')
  expect(entry).toEqual({
    check: 'inline-overflow',
    subject: 'x'.repeat(PREFLIGHT_SUBJECT_LIMIT),
    message: 'a block is 27.0mm wide in a 26.5mm column, so 0.5mm is clipped; narrow the block, let it wrap, or widen the column to clear this refusal',
    location: { folio: '12' },
  })
  expect(inlineOverflowEntry(102, 100, [], 'notes', 'div', 3, '')?.subject).toBe('notes div block 3')
  expect(inlineOverflowEntry(101, 100, [], 'notes', 'div', 3, '')).toBeUndefined()
})

test('embedded inline overflow functions include their axis dependency', () => {
  const embedded = new Function(
    `var PX_PER_MM=${PX_PER_MM},PREFLIGHT_SUBJECT_LIMIT=${PREFLIGHT_SUBJECT_LIMIT};${embeddedComposerInlineOverflowFunctions()};return inlineOverflowExtent`,
  )() as typeof inlineOverflowExtent
  expect(embedded({ width: 100, height: 202 }, 'vertical-rl', { inline: 2 })).toBe(204)
})
