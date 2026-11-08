import { computeFolios, type NumberSystem, type SectionNumbering, sequenceFolios } from '@segnavia/format'

export interface BookPlanPage {
  sequence: string
  flow: string
  blank: boolean
}

export interface BookPlanSection {
  id: string
  numbering?: SectionNumbering
}

export interface BookPlanNumbering {
  frontMatter: NumberSystem
  body: NumberSystem
}

export interface BookPlanFolioResult {
  folios: Array<string | null>
  total: string
}

export function bookPlanFolios(pages: readonly BookPlanPage[], numbering: BookPlanNumbering, sections: readonly BookPlanSection[] = []): BookPlanFolioResult {
  const sectionNumbering = new Map(sections.map((section) => [section.id, section.numbering]))
  const computed = computeFolios(
    pages.map((page, index) => ({
      numbering: {
        system: numbering[page.sequence === 'front' ? 'frontMatter' : 'body'],
        start: sectionNumbering.get(page.flow)?.restart ?? 1,
        restart: sectionNumbering.get(page.flow)?.restart !== undefined ? !page.blank : index === 0 || page.sequence !== pages[index - 1]?.sequence,
        counted: page.blank || sectionNumbering.get(page.flow)?.counted !== false,
      },
    })),
  )
  const folios = computed.map((folio, index) => (pages[index]?.blank ? null : (folio?.text ?? null)))
  const total = sequenceFolios(pages.length, numbering.body).at(-1)?.text ?? '0'
  return { folios, total }
}
