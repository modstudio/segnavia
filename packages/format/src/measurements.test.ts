import { expect, test } from 'bun:test'
import { PaginateBlock, PaginateLine } from './measurements.ts'

test('a measured line accepts optional opening and closing decoration edges', () => {
  expect(PaginateLine.parse({ top: 10, bottom: 20, decorationTop: 2, decorationBottom: 28 })).toEqual({
    top: 10,
    bottom: 20,
    decorationTop: 2,
    decorationBottom: 28,
  })
})

test('a measured line without decoration parses as before', () => {
  expect(PaginateLine.parse({ top: 10, bottom: 20 })).toEqual({ top: 10, bottom: 20 })
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
