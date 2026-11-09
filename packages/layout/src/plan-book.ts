import { formatNumber, type Measurements as FormatMeasurements } from '@segnavia/format'
import { type BookPlanDocumentNumbers, bookPlanDocumentNumbers } from './book-plan-document-numbers.ts'
import { type BookPlanFolioResult, type BookPlanNumbering, bookPlanFolios } from './book-plan-folios.ts'
import { paginateBook } from './paginate-book.ts'
import type { PaginateBookPage, PaginateBookRefusal } from './paginate-types.ts'

export type Measurements = FormatMeasurements

export interface BookPlan extends BookPlanFolioResult, BookPlanDocumentNumbers {
  version: 3
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
  const recordIndexes = new Map<string, number>()
  const pages = paginated.pages.map((page, index) => {
    if (!page.blank) recordIndexes.set(page.flow, (recordIndexes.get(page.flow) ?? 0) + 1)
    const variables = { ...page.variables }
    for (const variable of measurements.variables) {
      if (variable.kind === 'text') continue
      let value = ''
      if (variable.kind === 'folio') {
        if (variable.of === 'numbering') value = numbered.folios[index] ?? ''
        if (variable.of === 'document') value = documentNumbers.documentFolios[index] ?? ''
        if (variable.of === 'record' && !page.blank) value = formatNumber(recordIndexes.get(page.flow) ?? 0, numbering.body)
      } else {
        if (variable.of === 'numbering') value = numbered.total
        if (variable.of === 'document') value = documentNumbers.documentTotal
        if (variable.of === 'record') value = documentNumbers.recordTotals[page.flow] ?? ''
      }
      if (value) variables[variable.name] = value
    }
    return { ...page, variables }
  })
  return { ok: true, plan: { version: 3, pages, ...numbered, ...documentNumbers } }
}
