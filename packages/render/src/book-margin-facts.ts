import {
  type Book,
  type BookVariableNumberPage,
  bookVariablePageNumbers,
  effectiveParentRules,
  FLOWING_PARENT_RULES,
  LIBRARY_VARIABLES,
  type ParentRules,
  sequenceFolios,
  type VariableDocumentFacts,
  variableValue,
  withLibraryEntries,
} from '@segnavia/format'
import type { BookPageFacts, BookSectionInfo } from '@segnavia/html'
import type { BookDestination } from './book-destinations.ts'
import { folioTextAt } from './book-print-status.ts'

interface MarginPageOwner {
  page: number
  section: BookSectionInfo
}

export interface MarginDocumentContext {
  pages: BookVariableNumberPage[]
  offset: number
  system: Book['numbering']['body']
}

export interface MarginNumbering {
  system: Book['numbering']['body']
  printed: boolean
}

function marginPageOwners(
  sections: BookSectionInfo[],
  destinations: Map<string, BookDestination>,
  pages: number,
  blanks: Set<number>,
): Array<MarginPageOwner | undefined> {
  const starts = sections
    .flatMap((section) => {
      const page = destinations.get(section.id)?.page
      return page === undefined ? [] : [{ page, section }]
    })
    .sort((left, right) => left.page - right.page)
  return Array.from({ length: pages }, (_, offset) => {
    const page = offset + 1
    const next = starts.find((start) => start.page === page + 1)
    if (blanks.has(page) && next) return next
    return starts.filter((start) => start.page <= page).at(-1)
  })
}

export function marginVariablePagesFor(
  sections: BookSectionInfo[],
  destinations: Map<string, BookDestination>,
  pages: number,
  blanks: Set<number>,
): BookVariableNumberPage[] {
  return marginPageOwners(sections, destinations, pages, blanks).map((owner, offset) => ({
    flow: owner?.section.id ?? '',
    blank: blanks.has(offset + 1),
    counted: owner?.section.numbering?.counted !== false,
    record: owner?.section.record !== undefined,
  }))
}

export function marginFactsFor(
  sections: BookSectionInfo[],
  destinations: Map<string, BookDestination>,
  pages: number,
  blanks: Set<number>,
  numbering: MarginNumbering,
  variables: Book['variables'],
  document: MarginDocumentContext = { pages: marginVariablePagesFor(sections, destinations, pages, blanks), offset: 0, system: numbering.system },
  documentFacts: VariableDocumentFacts = {},
  bookRules?: ParentRules,
): BookPageFacts[] {
  const folios = sequenceFolios(pages, numbering.system, numbering.printed)
  const owners = marginPageOwners(sections, destinations, pages, blanks)
  const numbers = bookVariablePageNumbers(document.pages, document.system)
  const variablesFor = (owner: MarginPageOwner | undefined, index: number, folio: string): Record<string, string> => {
    const resolved: Record<string, string> = {}
    const documentIndex = document.offset + index
    for (const variable of withLibraryEntries(LIBRARY_VARIABLES, variables)) {
      const value = variableValue(variable, {
        folio,
        documentFolio: numbers.documentFolios[documentIndex],
        numberingTotal: folios[pages - 1]?.text ?? '0',
        documentTotal: numbers.documentTotal,
        recordIndex: owner?.section.record?.index,
        recordCount: owner?.section.record?.count,
        recordFolio: numbers.recordFolios[documentIndex] ?? undefined,
        recordTotal: owner ? numbers.recordTotals[owner.section.id] : undefined,
        sectionTitle: owner?.section.title,
        partTitles: owner?.section.parts,
        document: documentFacts,
      })
      if (value) resolved[variable.name] = value
    }
    return resolved
  }
  return Array.from({ length: pages }, (_, index): BookPageFacts => {
    const page = index + 1
    if (blanks.has(page)) return { blank: true, sectionOpening: false }
    const owner = owners[index]
    const folio = folioTextAt(folios, page)
    return {
      blank: false,
      sectionOpening: owner?.page === page,
      folio,
      parentRules: effectiveParentRules(owner?.section.parentRules, bookRules, FLOWING_PARENT_RULES),
      variables: variablesFor(owner, index, folio),
      recordSlots: owner?.section.values ?? {},
    }
  })
}
