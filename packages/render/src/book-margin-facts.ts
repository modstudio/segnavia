import {
  type Book,
  type BookVariableNumberPage,
  bookVariablePageNumbers,
  computeNumberingRuns,
  effectiveParentRules,
  FLOWING_PARENT_RULES,
  isContentTextVariable,
  LIBRARY_VARIABLES,
  type ParentRules,
  type VariableDocumentFacts,
  variableValue,
  withLibraryEntries,
} from '@segnavia/format'
import type { BookPageFacts, BookSectionInfo, BookVariableSetPoint } from '@segnavia/html'
import { continuousPageVariables } from '@segnavia/layout'
import type { BookDestination } from './book-destinations.ts'

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

export interface MarginContentSetPoint extends BookVariableSetPoint {
  page: number
  y: number
  atStart: boolean
}

export function continuousMarginVariableValues(
  pages: readonly BookVariableNumberPage[],
  variables: Book['variables'],
  contentSetPoints: readonly MarginContentSetPoint[],
): Array<Record<string, string>> {
  const contentDeclarations = variables.filter(isContentTextVariable)
  return continuousPageVariables(
    pages.map((page, index) => ({
      blank: page.blank,
      flow: page.flow,
      setPoints: contentSetPoints
        .filter((point) => point.page === index + 1)
        .sort((left, right) => right.y - left.y)
        .map(({ name, value, atStart }) => ({ name, value, atStart })),
    })),
    contentDeclarations,
  )
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
  contentValues: readonly Record<string, string>[] = [],
): BookPageFacts[] {
  const owners = marginPageOwners(sections, destinations, pages, blanks)
  // Each call covers one division, and continuous books refuse section and record restarts.
  const runs = computeNumberingRuns(
    Array.from({ length: pages }, (_, index) => ({
      numbering: {
        system: numbering.system,
        printed: numbering.printed,
        start: 1,
        restart: index === 0,
        counted: true,
      },
    })),
  )
  const numbers = bookVariablePageNumbers(document.pages, document.system)
  const variablesFor = (owner: MarginPageOwner | undefined, index: number, folio: string): Record<string, string> => {
    const resolved: Record<string, string> = { ...contentValues[index] }
    const documentIndex = document.offset + index
    for (const variable of withLibraryEntries(LIBRARY_VARIABLES, variables)) {
      if (isContentTextVariable(variable)) continue
      const value = variableValue(variable, {
        folio,
        documentFolio: numbers.documentFolios[documentIndex],
        numberingTotal: runs.totals[runs.runIndexes[index] ?? -1] ?? '',
        documentTotal: numbers.documentTotal,
        recordIndex: owner?.section.record?.index,
        recordCount: owner?.section.record?.count,
        recordFolio: numbers.recordFolios[documentIndex] ?? undefined,
        recordTotal: owner ? numbers.recordTotals[owner.section.id] : undefined,
        sectionTitle: owner?.section.title,
        chapterNumber: owner?.section.number,
        partTitles: owner?.section.parts,
        partNumbers: owner?.section.partNumbers,
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
    const countedFolio = runs.folios[index]
    const folio = countedFolio?.printed ? countedFolio.text : ''
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
