import { expect, test } from 'bun:test'
import { bookPagesPass, faultControlFailure, faultControlProvesShift, pageCountRefusal } from './book-verdict.ts'
import type { DocumentResult } from './types.ts'

const bars = (passed: boolean, pressMeasured = true): DocumentResult['bars'] =>
  ({
    effects: { passed, applicable: false },
    pressColor: { passed, measured: pressMeasured ? { mean: passed ? 0.4 : 12, p99: passed ? 4 : 80 } : undefined },
    grayPressColor: { passed },
    size: { passed },
  }) as DocumentResult['bars']

const page = (overrides: Partial<DocumentResult> & Pick<DocumentResult, 'id' | 'bars'>): DocumentResult =>
  ({
    title: overrides.id,
    kind: 'control',
    pdf: '',
    pdfBytes: 1,
    effectlessPdf: '',
    effectlessPdfBytes: 1,
    screen: '',
    width: 1,
    height: 1,
    comparisonBox: { screen: '', readers: '' },
    analysis: { vectorOps: false, shadingTypes: [], images: [], softMasks: 0, transparencyGroups: 0 },
    readers: [],
    blendedMask: '',
    blendedFraction: 0,
    ...overrides,
  }) as DocumentResult

test('a book passes only when every page passes every bar', () => {
  const passing = [page({ id: 'control-book-en/p01', bars: bars(true) }), page({ id: 'control-book-en/p02', bars: bars(true) })]
  expect(bookPagesPass(passing)).toBeTrue()
  expect(bookPagesPass([passing[0] as DocumentResult, page({ id: 'control-book-en/p02', bars: bars(false) })])).toBeFalse()
})

test('the fault control inverts: it holds only when the press bar was measured and failed', () => {
  const failed = page({ id: 'control-book-en-shifted/p02', bars: bars(false), faultControl: true })
  const passed = page({ id: 'control-book-en-shifted/p02', bars: bars(true), faultControl: true })
  const missing = page({ id: 'control-book-en-shifted/p02', bars: bars(false, false), faultControl: true })
  expect(faultControlProvesShift(failed)).toBeTrue()
  expect(faultControlProvesShift(passed)).toBeFalse()
  expect(faultControlProvesShift(missing)).toBeFalse()
  expect(faultControlFailure(passed)).toContain('passed the press bar')
  expect(faultControlFailure(missing)).toContain('no press measurement')
  expect(faultControlFailure(failed)).toBeUndefined()
})

test('a page-count mismatch names both counts', () => {
  expect(pageCountRefusal(3, 3)).toBeUndefined()
  expect(pageCountRefusal(3, 4)).toBe('The book has 3 screen papers and 4 PDF pages.')
})
