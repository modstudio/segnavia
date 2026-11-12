import { computeFolios, divisionPrints, type NumberSystem, type RecordFacts, type SectionNumbering } from '@segnavia/format'

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
  printed?: { frontMatter: boolean; body: boolean }
}

export interface BookPlanFolioResult {
  folios: Array<string | null>
  folioPrints: Array<boolean | null>
  total: string
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
          printed: divisionPrints(numbering, page.sequence === 'front' ? 'frontMatter' : 'body'),
          start: section?.restart ?? 1,
          restart: section?.restart !== undefined ? firstNonBlankPage.get(page.flow) === index : index === 0 || page.sequence !== pages[index - 1]?.sequence,
          counted: section?.counted !== false,
        },
      }
    }),
  )
  const folios = computed.map((folio, index) => (pages[index]?.blank || !folio?.printed ? null : folio.text))
  const folioPrints = computed.map((folio, index) => (pages[index]?.blank || folio === null ? null : folio.printed))
  let lastCounted: string | undefined
  let lastBody: string | undefined
  computed.forEach((folio, index) => {
    if (folio === null) return
    lastCounted = folio.text
    if (pages[index]?.sequence === 'body') lastBody = folio.text
  })
  const total = lastBody ?? lastCounted ?? '0'
  return { folios, folioPrints, total }
}
