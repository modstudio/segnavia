import type { BookPage, BookSectionEntry } from './book.ts'
import { sheetMm } from './paper.ts'
import type { PageGeometry, StyleSheet } from './style-sheet.ts'

export const DEFAULT_PAGE_GEOMETRY = 'segnavia:default'

export interface ResolvedBookPageGeometry {
  name: string
  paper: { width: number; height: number }
  margin: BookPage['margin']
  columns: { count: number; gap: number }
}

function resolved(name: string, geometry: Pick<PageGeometry, 'paper' | 'orientation' | 'margin' | 'columns'>, defaultGap: number): ResolvedBookPageGeometry {
  return {
    name,
    paper: sheetMm(geometry),
    margin: geometry.margin,
    columns: geometry.columns ?? { count: 1, gap: defaultGap },
  }
}

interface BookGeometrySource {
  page?: BookPage
  style?: StyleSheet
}

export function resolveBookPageGeometry(book: BookGeometrySource, name?: string): ResolvedBookPageGeometry | undefined {
  if (!book.page) return undefined
  if (name === undefined) return resolved(DEFAULT_PAGE_GEOMETRY, book.page, book.page.columnGap)
  const geometry = book.style?.pageGeometries?.[name]
  return geometry ? resolved(name, geometry, book.page.columnGap) : undefined
}

export function sectionPageGeometry(book: BookGeometrySource, section: Pick<BookSectionEntry, 'entry'>): ResolvedBookPageGeometry | undefined {
  return resolveBookPageGeometry(book, 'pageGeometry' in section.entry ? section.entry.pageGeometry : undefined)
}

export function bookPageGeometries(book: BookGeometrySource): ResolvedBookPageGeometry[] {
  const base = resolveBookPageGeometry(book)
  if (!base) return []
  return [
    base,
    ...Object.keys(book.style?.pageGeometries ?? {}).flatMap((name) => {
      const geometry = resolveBookPageGeometry(book, name)
      return geometry ? [geometry] : []
    }),
  ]
}

export function sameBookPageGeometry(left: ResolvedBookPageGeometry | undefined, right: ResolvedBookPageGeometry | undefined): boolean {
  return JSON.stringify(left && { paper: left.paper, margin: left.margin, columns: left.columns }) === JSON.stringify(right && { paper: right.paper, margin: right.margin, columns: right.columns })
}
