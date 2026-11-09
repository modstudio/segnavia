import { type BookViewPagination, bookPageName, PX_PER_MM, type ResolvedParentPage, resolveParentPages, textArea } from '@segnavia/format'

export interface ComposerPageGeometry {
  name?: string
  pageName: string
  paper: { width: number; height: number }
  paperWidth: number
  paperHeight: number
  columnGap: number
  columnCount: number
  parents: Array<ResolvedParentPage & { textArea: { width: number; height: number } }>
}

export function composerPageGeometries(pagination: BookViewPagination): ComposerPageGeometry[] {
  const furniture = new Map(resolveParentPages(pagination.parents).map((parent) => [parent.name, parent]))
  return pagination.geometries.map((geometry, index) => {
    const paper = { width: geometry.paper.width * PX_PER_MM, height: geometry.paper.height * PX_PER_MM }
    const parents = geometry.parents.map((parent) => {
      const resolved = furniture.get(parent.name)
      if (!resolved)
        throw new Error(`Page geometry parent "${parent.name}" has no matching pagination parent; add it to pagination.parents to clear this refusal`)
      const margin = Object.fromEntries(Object.entries(parent.margin).map(([key, value]) => [key, value * PX_PER_MM])) as typeof parent.margin
      return { ...resolved, margin, textArea: textArea({ margin }, paper) }
    })
    return {
      name: geometry.name,
      pageName: bookPageName(index),
      paper: geometry.paper,
      paperWidth: paper.width,
      paperHeight: paper.height,
      columnGap: geometry.columns.gap * PX_PER_MM,
      columnCount: geometry.columns.count,
      parents,
    }
  })
}

export function composerPageRules(geometries: ComposerPageGeometry[]): string {
  return geometries.map((geometry) => `@page ${geometry.pageName}{size:${geometry.paper.width}mm ${geometry.paper.height}mm;margin:0}`).join('')
}
