import { expect, test } from 'bun:test'
import { Measurements, PaginateBlock, PaginateLine } from './measurements.ts'

test('a measured line accepts optional numbering, decoration, and repeated-header facts', () => {
  expect(PaginateLine.parse({ top: 10, bottom: 20, counted: false, decorationTop: 2, decorationBottom: 28, headerHeight: 12 })).toEqual({
    top: 10,
    bottom: 20,
    counted: false,
    decorationTop: 2,
    decorationBottom: 28,
    headerHeight: 12,
  })
})

test('a measured block accepts optional keep-together line runs', () => {
  expect(
    PaginateBlock.parse({
      kind: 'table',
      tag: 'table',
      position: { chapter: 1, block: 2 },
      lines: [
        { top: 0, bottom: 10 },
        { top: 10, bottom: 20 },
      ],
      keepRuns: [{ start: 0, end: 2 }],
    }).keepRuns,
  ).toEqual([{ start: 0, end: 2 }])
})

test('a measured block accepts the start line of a nested tail keep', () => {
  expect(
    PaginateBlock.parse({
      kind: 'text',
      tag: 'section',
      position: { chapter: 1, block: 2 },
      lines: [{ top: 0, bottom: 10 }],
      keepWithNext: true,
      keepWithNextFrom: 0,
    }).keepWithNextFrom,
  ).toBe(0)
})

test('a measured block accepts forced breaks on either edge', () => {
  const block = PaginateBlock.parse({
    kind: 'text',
    tag: 'p',
    position: { chapter: 1, block: 2 },
    lines: [{ top: 0, bottom: 10 }],
    breakBefore: true,
    breakAfter: true,
  })
  expect({ breakBefore: block.breakBefore, breakAfter: block.breakAfter }).toEqual({ breakBefore: true, breakAfter: true })
})

test('measurements default measured properties and carry their kind and unit', () => {
  const input = {
    variables: [],
    flows: [],
    notes: [],
    geometry: { notesGap: 0 },
    parents: {},
    settings: { rectoOpenings: false, direction: 'ltr' as const, endnotePlacement: 'book' as const },
  }
  expect(Measurements.parse(input).properties).toEqual([])
  expect(
    Measurements.parse({ ...input, properties: [{ id: 'words', name: '--widest', kind: 'max-content-inline:children', value: 84.25, unit: 'px' }] }).properties,
  ).toEqual([{ id: 'words', name: '--widest', kind: 'max-content-inline:children', value: 84.25, unit: 'px' }])
  expect(() => Measurements.parse({ ...input, properties: [{ id: 'words', name: '--widest', kind: 'line-count', value: 2, unit: 'px' }] })).toThrow()
})
