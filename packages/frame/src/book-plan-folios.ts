import { computeFolios, type NumberSystem, sequenceFolios } from '@segnavia/format'

export interface BookPlanPage {
  sequence: string
}

export interface BookPlanNumbering {
  frontMatter: NumberSystem
  body: NumberSystem
}

export interface BookPlanFolioResult {
  folios: string[]
  total: string
}

export function bookPlanFolios(pages: readonly BookPlanPage[], numbering: BookPlanNumbering): BookPlanFolioResult {
  const computed = computeFolios(
    pages.map((page, index) => ({
      numbering: {
        system: numbering[page.sequence === 'front' ? 'frontMatter' : 'body'],
        start: 1,
        restart: index === 0 || page.sequence !== pages[index - 1]?.sequence,
        counted: true,
      },
    })),
  )
  const folios = computed.map((folio, index) => {
    if (!folio) throw new RangeError(`Book plan page ${index} has no computed folio.`)
    return folio.text
  })
  const total = sequenceFolios(pages.length, numbering.body).at(-1)?.text ?? '0'
  return { folios, total }
}
