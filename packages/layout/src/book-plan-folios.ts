import { computeFolios, formatNumber, type NumberSystem, type SectionNumbering } from '@segnavia/format'

export interface BookPlanPage {
  sequence: string
  flow: string
  blank: boolean
}

export interface BookPlanSection {
  id: string
  numbering?: SectionNumbering
  record?: { index: number; count: number }
}

export interface BookPlanNumbering {
  frontMatter: NumberSystem
  body: NumberSystem
}

export interface BookPlanFolioResult {
  folios: Array<string | null>
  total: string
  documentFolios: Array<string | null>
  documentTotal: string
  recordTotals: Record<string, string>
  records: Record<string, { index: string; count: string }>
}

export function bookPlanFolios(pages: readonly BookPlanPage[], numbering: BookPlanNumbering, sections: readonly BookPlanSection[] = []): BookPlanFolioResult {
  const sectionNumbering = new Map(sections.map((section) => [section.id, section.numbering]))
  const firstNonBlankPage = new Map<string, number>()
  pages.forEach((page, index) => {
    if (!page.blank && !firstNonBlankPage.has(page.flow)) firstNonBlankPage.set(page.flow, index)
  })
  const computed = computeFolios(
    pages.map((page, index) => {
      const section = sectionNumbering.get(page.flow)
      return {
        numbering: {
          system: numbering[page.sequence === 'front' ? 'frontMatter' : 'body'],
          start: section?.restart ?? 1,
          restart: section?.restart !== undefined ? firstNonBlankPage.get(page.flow) === index : index === 0 || page.sequence !== pages[index - 1]?.sequence,
          counted: section?.counted !== false,
        },
      }
    }),
  )
  const folios = computed.map((folio, index) => (pages[index]?.blank ? null : (folio?.text ?? null)))
  let lastCounted: string | undefined
  let lastBody: string | undefined
  computed.forEach((folio, index) => {
    if (folio === null) return
    lastCounted = folio.text
    if (pages[index]?.sequence === 'body') lastBody = folio.text
  })
  const total = lastBody ?? lastCounted ?? '0'
  const documentComputed = computeFolios(
    pages.map((page, index) => ({
      numbering: {
        system: numbering.body,
        start: 1,
        restart: index === 0,
        counted: sectionNumbering.get(page.flow)?.counted !== false,
      },
    })),
  )
  const documentFolios = documentComputed.map((folio, index) => (pages[index]?.blank ? null : (folio?.text ?? null)))
  const documentTotal = documentComputed.reduce((last, folio) => folio?.text ?? last, '0')
  const recordFlows = new Map(sections.filter((section) => section.record).map((section) => [section.id, section.record!]))
  const recordTotals: Record<string, string> = {}
  computed.forEach((folio, index) => {
    const flow = pages[index]?.flow
    if (folio && flow && recordFlows.has(flow)) recordTotals[flow] = folio.text
  })
  const records = Object.fromEntries(
    [...recordFlows].map(([flow, record]) => [flow, { index: formatNumber(record.index, numbering.body), count: formatNumber(record.count, numbering.body) }]),
  )
  return { folios, total, documentFolios, documentTotal, recordTotals, records }
}
