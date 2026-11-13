import { expect, test } from 'bun:test'
import type { ImpositionInput } from '@segnavia/format'
import { parsePagePdfOptions } from './page-render-options.ts'

const imposition: ImpositionInput = {
  paper: 'letter',
  orientation: 'portrait',
  unit: 'in',
  columns: 3,
  rows: 10,
  cell: { width: 2.625, height: 1 },
  margin: { top: 0.5, right: 0, bottom: 0, left: 0.1875 },
  gap: { column: 0.125, row: 0 },
}

test('accepts imposition for pagesPdf and refuses it for pagePdf', () => {
  expect(parsePagePdfOptions({ imposition } as never, 'pagesPdf')).toMatchObject({ imposition })
  expect(() => parsePagePdfOptions({ imposition } as never, 'pagePdf')).toThrow(
    'pagePdf options.imposition: unknown option "imposition"; remove it to clear this refusal',
  )
})
