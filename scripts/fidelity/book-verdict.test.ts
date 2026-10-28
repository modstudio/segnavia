import { expect, test } from 'bun:test'
import { bookPagesPass, failedBookBars, faultControlFailure, faultControlProvesShift, pageCountRefusal } from './book-verdict.ts'
import type { DocumentResult, RegistrationMeasurement } from './types.ts'

const registration = (passed: boolean): RegistrationMeasurement => ({
  dy: passed ? 0 : 96,
  residual: passed ? 0.04 : 0.04,
  residual0: passed ? 0.04 : 0.3,
  dx: 0,
  residualX: 0.03,
  residualX0: 0.03,
})

const bars = (passed: boolean, registrationMeasured = true): DocumentResult['bars'] =>
  ({
    effects: { passed: true, applicable: false },
    pressColor: { passed, measured: { mean: passed ? 0.4 : 12, p99: passed ? 4 : 80 } },
    grayPressColor: { passed: true },
    size: { passed: true },
    registration: {
      passed: registrationMeasured ? passed : true,
      measured: registrationMeasured ? registration(passed) : undefined,
      applicable: true,
    },
  }) as DocumentResult['bars']

const page = (overrides: Partial<DocumentResult> & Pick<DocumentResult, 'id' | 'bars'>): DocumentResult =>
  ({
    title: overrides.id,
    kind: 'book',
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

test('the fault control inverts: it holds only when the registration bar was measured and failed', () => {
  const failed = page({ id: 'control-book-en-shifted/p02', bars: bars(false), faultControl: true })
  const passed = page({ id: 'control-book-en-shifted/p02', bars: bars(true), faultControl: true })
  const missing = page({
    id: 'control-book-en-shifted/p02',
    bars: bars(false, false),
    faultControl: true,
  })
  expect(faultControlProvesShift(failed)).toBeTrue()
  expect(faultControlProvesShift(passed)).toBeFalse()
  expect(faultControlProvesShift(missing)).toBeFalse()
  expect(faultControlFailure(passed)).toContain('passed the registration bar')
  expect(faultControlFailure(missing)).toContain('no registration measurement')
  expect(faultControlFailure(failed)).toBeUndefined()
  expect(failedBookBars(failed)).toContain('Line registration')
})

test('a page-count mismatch names both counts', () => {
  expect(pageCountRefusal(3, 3)).toBeUndefined()
  expect(pageCountRefusal(3, 4)).toBe('The book has 3 screen papers and 4 PDF pages.')
})
