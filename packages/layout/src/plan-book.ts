import {
  bookVariablePageNumbers,
  type Measurements as FormatMeasurements,
  LIBRARY_VARIABLES,
  PLAN_VERSION,
  type Variable,
  variableValue,
  withLibraryEntries,
} from '@segnavia/format'
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
  recordFolio: string | null,
  record: { index: number; count: number } | undefined,
  folios: BookPlanFolioResult,
  documents: BookPlanDocumentNumbers,
): string {
  return variableValue(variable, {
    folio: folios.folios[index],
    documentFolio: documents.documentFolios[index],
    numberingTotal: folios.total,
    documentTotal: documents.documentTotal,
    recordIndex: record?.index,
    recordCount: record?.count,
    recordFolio: recordFolio ?? '',
    recordTotal: documents.recordTotals[page.flow],
  })
}

export function pagesWithNumberVariables(
  pages: PaginateBookPage[],
  variables: readonly Variable[],
  numbering: BookPlanNumbering,
  folios: BookPlanFolioResult,
  documents: BookPlanDocumentNumbers,
  sections: readonly BookPlanSection[] = [],
): PaginateBookPage[] {
  const countedByFlow = new Map(sections.map((section) => [section.id, section.numbering?.counted !== false]))
  const recordsByFlow = new Map(sections.flatMap((section) => (section.record ? [[section.id, section.record] as const] : [])))
  const numberPages = bookVariablePageNumbers(
    pages.map((page) => ({
      flow: page.flow,
      blank: page.blank,
      counted: countedByFlow.get(page.flow) !== false,
      record: recordsByFlow.has(page.flow),
    })),
    numbering.body,
  )
  return pages.map((page, index) => {
    const resolved = { ...page.variables }
    for (const variable of variables) {
      if (variable.kind === 'text') continue
      const value = numberVariableValue(variable, page, index, numberPages.recordFolios[index] ?? null, recordsByFlow.get(page.flow), folios, documents)
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
  return planBookWithVersion({ ...measurements, variables: withLibraryEntries(LIBRARY_VARIABLES, measurements.variables) }, numbering, PLAN_VERSION)
}

export function planBookScript(): string {
  return `var planBookImplementation=${planBookWithVersion.toString()};
var planBook=function(measurements,numbering){return planBookImplementation({...measurements,variables:withLibraryEntries(LIBRARY_VARIABLES,measurements.variables)},numbering,${PLAN_VERSION});};`
}
