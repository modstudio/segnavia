import type { Measurements as FormatMeasurements } from '@segnavia/format'
import { type BookPlanDocumentNumbers, bookPlanDocumentNumbers } from './book-plan-document-numbers.ts'
import { type BookPlanFolioResult, type BookPlanNumbering, bookPlanFolios } from './book-plan-folios.ts'
import { paginateBook } from './paginate-book.ts'
import type { PaginateBookPage, PaginateBookRefusal } from './paginate-types.ts'

export type Measurements = FormatMeasurements

export interface BookPlan extends BookPlanFolioResult, BookPlanDocumentNumbers {
  pages: PaginateBookPage[]
}

export function planBook(
  measurements: Measurements,
  numbering: BookPlanNumbering,
): { ok: true; plan: BookPlan } | { ok: false; refusals: PaginateBookRefusal[] } {
  const paginated = paginateBook(measurements)
  if (paginated.refusals.length > 0) return { ok: false, refusals: paginated.refusals }
  const numbered = bookPlanFolios(paginated.pages, numbering, measurements.flows)
  const documentNumbers = bookPlanDocumentNumbers(paginated.pages, numbering, measurements.flows)
  return { ok: true, plan: { pages: paginated.pages, ...numbered, ...documentNumbers } }
}
