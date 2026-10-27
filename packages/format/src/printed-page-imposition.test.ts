import { describe, expect, test } from 'bun:test'
import { Imposition, Print } from './index.ts'
import { isPrintedPageIdentityImposition } from './printed-page-imposition.ts'

const print = Print.parse({ paper: 'letter', orientation: 'portrait' })
const identity = {
  paper: 'letter' as const,
  orientation: 'portrait' as const,
  columns: 1,
  rows: 1,
  cell: { width: 215.9, height: 279.4 },
}

describe('printed-page identity imposition', () => {
  test('accepts exactly one full-paper cell', () => {
    expect(isPrintedPageIdentityImposition(print, Imposition.parse(identity))).toBe(true)
  })

  test.each([
    { columns: 2, cell: { width: 100, height: 279.4 } },
    { margin: { top: 1, right: 0, bottom: 0, left: 0 }, cell: { width: 215.9, height: 278.4 } },
    { gap: { column: 1, row: 0 } },
    { bleed: 1 },
    { marks: true },
    { skip: 1, columns: 2, cell: { width: 100, height: 279.4 } },
    { sides: 'two' as const },
    { fill: 'repeat' as const },
    { orientation: 'landscape' as const, cell: { width: 279.4, height: 215.9 } },
  ])('refuses a non-identity setting %#', (change) => {
    expect(isPrintedPageIdentityImposition(print, Imposition.parse({ ...identity, ...change }))).toBe(false)
  })
})
