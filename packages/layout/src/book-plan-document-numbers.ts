import { bookVariablePageNumbers, formatNumber } from '@segnavia/format'
import type { BookPlanNumbering, BookPlanPage, BookPlanSection } from './book-plan-folios.ts'

export interface BookPlanDocumentNumbers {
  documentFolios: Array<string | null>
  documentTotal: string
  recordTotals: Record<string, string>
  records: Record<string, { index: string; count: string }>
}

export function bookPlanDocumentNumbers(
  pages: readonly BookPlanPage[],
  numbering: BookPlanNumbering,
  sections: readonly BookPlanSection[] = [],
): BookPlanDocumentNumbers {
  const byFlow = new Map(sections.map((section) => [section.id, section]))
  const recordFlows = new Map(sections.flatMap((section) => (section.record ? [[section.id, section.record] as const] : [])))
  const numbers = bookVariablePageNumbers(
    pages.map((page) => ({
      flow: page.flow,
      blank: page.blank,
      counted: byFlow.get(page.flow)?.numbering?.counted !== false,
      record: recordFlows.has(page.flow),
    })),
    numbering.body,
  )
  const records = Object.fromEntries(
    [...recordFlows].map(([flow, record]) => [flow, { index: formatNumber(record.index, numbering.body), count: formatNumber(record.count, numbering.body) }]),
  )
  return { documentFolios: numbers.documentFolios, documentTotal: numbers.documentTotal, recordTotals: numbers.recordTotals, records }
}
