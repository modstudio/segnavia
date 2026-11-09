import { type Measurements as FormatMeasurements, formatNumber, PLAN_VERSION, type Variable } from '@segnavia/format'
import { type BookPlanDocumentNumbers, bookPlanDocumentNumbers } from './book-plan-document-numbers.ts'
import { type BookPlanFolioResult, type BookPlanNumbering, type BookPlanSection, bookPlanFolios } from './book-plan-folios.ts'
import { paginateBook } from './paginate-book.ts'
import type { PaginateBookPage, PaginateBookRefusal } from './paginate-types.ts'

export type Measurements = FormatMeasurements

export interface BookPlan extends BookPlanFolioResult, BookPlanDocumentNumbers {
  version: typeof PLAN_VERSION
  pages: PaginateBookPage[]
}

export function numberVariableValue(
  variable: Exclude<Variable, { kind: 'text' }>,
  page: PaginateBookPage,
  index: number,
  recordIndex: number,
  numbering: BookPlanNumbering,
  folios: BookPlanFolioResult,
  documents: BookPlanDocumentNumbers,
): string {
  if (variable.kind === 'folio') {
    if (variable.of === 'numbering') return folios.folios[index] ?? ''
    if (variable.of === 'document') return documents.documentFolios[index] ?? ''
    return page.blank ? '' : formatNumber(recordIndex, numbering.body)
  }
  if (variable.of === 'numbering') return folios.total
  if (variable.of === 'document') return documents.documentTotal
  return documents.recordTotals[page.flow] ?? ''
}

export function pagesWithNumberVariables(
  pages: PaginateBookPage[],
  variables: readonly Variable[],
  numbering: BookPlanNumbering,
  folios: BookPlanFolioResult,
  documents: BookPlanDocumentNumbers,
  sections: readonly BookPlanSection[] = [],
): PaginateBookPage[] {
  const recordIndexes = new Map<string, number>()
  const countedByFlow = new Map(sections.map((section) => [section.id, section.numbering?.counted !== false]))
  return pages.map((page, index) => {
    if (countedByFlow.get(page.flow) !== false) recordIndexes.set(page.flow, (recordIndexes.get(page.flow) ?? 0) + 1)
    const resolved = { ...page.variables }
    for (const variable of variables) {
      if (variable.kind === 'text') continue
      const value = numberVariableValue(variable, page, index, recordIndexes.get(page.flow) ?? 0, numbering, folios, documents)
      if (value) resolved[variable.name] = value
    }
    return { ...page, variables: resolved }
  })
}

function planBookWithVersion(
  measurements: Measurements,
  numbering: BookPlanNumbering,
  version: typeof PLAN_VERSION,
): { ok: true; plan: BookPlan } | { ok: false; refusals: PaginateBookRefusal[] } {
  const paginated = paginateBook(measurements)
  if (paginated.refusals.length > 0) return { ok: false, refusals: paginated.refusals }
  const numbered = bookPlanFolios(paginated.pages, numbering, measurements.flows)
  const documentNumbers = bookPlanDocumentNumbers(paginated.pages, numbering, measurements.flows)
  const pages = pagesWithNumberVariables(paginated.pages, measurements.variables, numbering, numbered, documentNumbers, measurements.flows)
  return { ok: true, plan: { version, pages, ...numbered, ...documentNumbers } }
}

export function planBook(
  measurements: Measurements,
  numbering: BookPlanNumbering,
): { ok: true; plan: BookPlan } | { ok: false; refusals: PaginateBookRefusal[] } {
  return planBookWithVersion(measurements, numbering, PLAN_VERSION)
}

export function planBookScript(): string {
  return `var planBookImplementation=${planBookWithVersion.toString()};
var planBook=function(measurements,numbering){return planBookImplementation(measurements,numbering,${PLAN_VERSION});};`
}
