import { computeNumberingRuns, type divisionNumbering, divisionPrints, type NumberSystem, type RecordFacts, type SectionNumbering } from '@segnavia/format'

export interface BookPlanPage {
  sequence: string
  flow: string
  blank: boolean
}

export interface BookPlanSection {
  id: string
  numbering?: SectionNumbering
  record?: RecordFacts
}

export interface BookPlanNumbering {
  frontMatter: NumberSystem
  body: NumberSystem
  printed?: ReturnType<typeof divisionNumbering>['printed']
}

export interface BookPlanFolioResult {
  folios: Array<string | null>
  folioPrints: Array<boolean | null>
  numberingTotals: string[]
  total: string
}

export function bookPlanFolios(pages: readonly BookPlanPage[], numbering: BookPlanNumbering, sections: readonly BookPlanSection[] = []): BookPlanFolioResult {
  const sectionNumbering = new Map(sections.map((section) => [section.id, section.numbering]))
  const recordFlows = new Set(sections.filter((section) => section.record !== undefined).map((section) => section.id))
  const firstNonBlankPage = new Map<string, number>()
  pages.forEach((page, index) => {
    if (!page.blank && !firstNonBlankPage.has(page.flow)) firstNonBlankPage.set(page.flow, index)
  })
  const runs = computeNumberingRuns(
    pages.map((page, index) => {
      const section = sectionNumbering.get(page.flow)
      const division = page.sequence === 'front' ? 'frontMatter' : 'body'
      const start = section?.restart ?? (recordFlows.has(page.flow) ? 1 : undefined)
      return {
        numbering: {
          system: numbering[division],
          printed: divisionPrints(numbering, division),
          start: start ?? 1,
          restart: start !== undefined ? firstNonBlankPage.get(page.flow) === index : index === 0 || page.sequence !== pages[index - 1]?.sequence,
          counted: section?.counted !== false,
        },
      }
    }),
  )
  const computed = runs.folios
  const folios = computed.map((folio, index) => (pages[index]?.blank || !folio?.printed ? null : folio.text))
  const folioPrints = computed.map((folio, index) => (pages[index]?.blank || folio === null ? null : folio.printed))
  const numberingTotals = runs.runIndexes.map((runIndex) => runs.totals[runIndex] ?? '')
  let lastCounted: string | undefined
  let lastBody: string | undefined
  computed.forEach((folio, index) => {
    if (folio === null) return
    lastCounted = folio.text
    if (pages[index]?.sequence === 'body') lastBody = folio.text
  })
  const total = lastBody ?? lastCounted ?? '0'
  return { folios, folioPrints, numberingTotals, total }
}
