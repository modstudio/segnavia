import { BOOK_PARENT_NAMES, type BookViewPagination, bookParentPages, PX_PER_MM, resolveParentPages, textArea } from '@segnavia/format'

export interface ComposerPageGeometry {
  name: string
  pageName: string
  paperWidth: number
  paperHeight: number
  columnGap: number
  columnCount: number
  parents: Array<ReturnType<typeof resolveParentPages>[number] & { textArea: { width: number; height: number } }>
}

const defaultParentNames = new Set(Object.values(BOOK_PARENT_NAMES))

export function composerPageGeometries(pagination: BookViewPagination): ComposerPageGeometry[] {
  const customParents = pagination.parents.filter((parent) => !defaultParentNames.has(parent.name as (typeof BOOK_PARENT_NAMES)[keyof typeof BOOK_PARENT_NAMES]))
  const source = pagination.geometries ?? [
    {
      name: 'segnavia:default',
      paper: pagination.paper,
      margin: pagination.margin,
      columns: { count: 1, gap: pagination.columnGap },
    },
  ]
  return source.map((geometry, index) => {
    const paper = { width: geometry.paper.width * PX_PER_MM, height: geometry.paper.height * PX_PER_MM }
    const parents = resolveParentPages([...bookParentPages(geometry.margin), ...customParents]).map((parent) => {
      const margin = Object.fromEntries(Object.entries(parent.margin).map(([key, value]) => [key, value * PX_PER_MM])) as typeof parent.margin
      return { ...parent, margin, textArea: textArea({ margin }, paper) }
    })
    return {
      name: geometry.name,
      pageName: `segnavia-page-${index + 1}`,
      paperWidth: paper.width,
      paperHeight: paper.height,
      columnGap: geometry.columns.gap * PX_PER_MM,
      columnCount: geometry.columns.count,
      parents,
    }
  })
}

export function composerPageRules(pagination: BookViewPagination, geometries: ComposerPageGeometry[]): string {
  const source = pagination.geometries ?? [{ paper: pagination.paper }]
  return geometries
    .map((geometry, index) => {
      const paper = source[index]?.paper
      return paper ? `@page ${geometry.pageName}{size:${paper.width}mm ${paper.height}mm;margin:0}` : ''
    })
    .join('')
}
