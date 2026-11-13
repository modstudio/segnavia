import { expect, test } from 'bun:test'
import { Refusal } from '@segnavia/format'
import { PaginatedBookRefusedError } from './book-document.ts'
import { StyleSheetRefusedError } from './frame-style-sheets.ts'
import { FontRefusedError } from './page-fonts.ts'
import { PrintedPagesRefusedError } from './printed-page-geometry.ts'

test.each([
  [new PaginatedBookRefusedError('message'), 'paginated-book'],
  [new StyleSheetRefusedError('message'), 'style-sheet'],
  [new FontRefusedError('message'), 'font'],
  [new PrintedPagesRefusedError('message'), 'printed-pages'],
] as const)('%s is a refusal with code %s', (error, code) => {
  expect(error).toBeInstanceOf(Refusal)
  expect(error.code).toBe(code)
})
