import { type Book, formatNumber, LIBRARY_VARIABLES, sequenceFolios, variableValue, withLibraryEntries } from '@segnavia/format'
import type { BookPageFacts, BookSectionInfo } from '@segnavia/html'
import type { BookDestination } from './book-destinations.ts'
import { folioTextAt } from './book-print-status.ts'

export function marginFactsFor(
  sections: BookSectionInfo[],
  destinations: Map<string, BookDestination>,
  pages: number,
  blanks: Set<number>,
  system: Book['numbering']['body'],
  variables: Book['variables'],
): BookPageFacts[] {
  const folios = sequenceFolios(pages, system)
  const starts = sections
    .flatMap((section) => {
      const page = destinations.get(section.id)?.page
      return page === undefined ? [] : [{ page, section }]
    })
    .sort((left, right) => left.page - right.page)
  const countedPages = (from: number, through: number) => {
    let count = 0
    for (let page = from; page <= through; page += 1) if (!blanks.has(page)) count += 1
    return count
  }
  const variablesFor = (owner: (typeof starts)[number] | undefined, page: number, folio: string): Record<string, string> => {
    const resolved: Record<string, string> = {}
    const ownerIndex = owner ? starts.indexOf(owner) : -1
    const ownerEnd = ownerIndex >= 0 ? (starts[ownerIndex + 1]?.page ?? pages + 1) - 1 : page
    const recordFolio = owner?.section.record ? formatNumber(countedPages(owner.page, page), system) : undefined
    const recordTotal = owner?.section.record ? formatNumber(countedPages(owner.page, ownerEnd), system) : undefined
    const documentFolio = formatNumber(countedPages(1, page), system)
    const documentTotal = formatNumber(countedPages(1, pages), system)
    for (const variable of withLibraryEntries(LIBRARY_VARIABLES, variables)) {
      const value = variableValue(variable, {
        folio,
        documentFolio,
        numberingTotal: folioTextAt(folios, pages),
        documentTotal,
        recordIndex: owner?.section.record?.index,
        recordCount: owner?.section.record?.count,
        recordFolio,
        recordTotal,
        sectionTitle: owner?.section.title,
      })
      if (value) resolved[variable.name] = value
    }
    return resolved
  }
  return Array.from({ length: pages }, (_, index): BookPageFacts => {
    const page = index + 1
    if (blanks.has(page)) return { blank: true, sectionOpening: false }
    const owner = starts.filter((start) => start.page <= page).at(-1)
    const folio = folioTextAt(folios, page)
    return {
      blank: false,
      sectionOpening: owner?.page === page,
      folio,
      variables: variablesFor(owner, page, folio),
      recordSlots: owner?.section.values ?? {},
    }
  })
}
