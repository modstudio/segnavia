import { computeFolios, formatNumber } from '@segnavia/format'
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
  const documentComputed = computeFolios(
    pages.map((page, index) => ({
      numbering: { system: numbering.body, start: 1, restart: index === 0, counted: byFlow.get(page.flow)?.numbering?.counted !== false },
    })),
  )
  const documentFolios = documentComputed.map((folio, index) => (pages[index]?.blank ? null : (folio?.text ?? null)))
  const documentTotal = documentComputed.reduce((last, folio) => folio?.text ?? last, '0')
  const recordFlows = new Map(sections.flatMap((section) => (section.record ? [[section.id, section.record] as const] : [])))
  const recordTotals: Record<string, string> = {}
  const flowCounts = new Map<string, number>()
  pages.forEach((page) => {
    if (byFlow.get(page.flow)?.numbering?.counted !== false) flowCounts.set(page.flow, (flowCounts.get(page.flow) ?? 0) + 1)
  })
  for (const flow of recordFlows.keys()) recordTotals[flow] = formatNumber(flowCounts.get(flow) ?? 0, numbering.body)
  const records = Object.fromEntries(
    [...recordFlows].map(([flow, record]) => [flow, { index: formatNumber(record.index, numbering.body), count: formatNumber(record.count, numbering.body) }]),
  )
  return { documentFolios, documentTotal, recordTotals, records }
}
