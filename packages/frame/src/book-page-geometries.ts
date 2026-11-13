import {
  type BookViewPagination,
  bookPageName,
  type Print,
  PX_PER_MM,
  pressBoxes,
  type ResolvedParentPage,
  resolveParentPages,
  textArea,
  usesPressLayout,
} from '@segnavia/format'

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

export function composerParentGeometry<T extends ResolvedParentPage>(
  parent: T,
  paper: { width: number; height: number },
): T & { textArea: { width: number; height: number } } {
  const margin = Object.fromEntries(Object.entries(parent.margin).map(([key, value]) => [key, value * PX_PER_MM])) as typeof parent.margin
  return { ...parent, margin, textArea: textArea({ margin }, paper) }
}

export function composerPageGeometries(pagination: BookViewPagination): ComposerPageGeometry[] {
  const furniture = new Map(resolveParentPages(pagination.parents).map((parent) => [parent.name, parent]))
  return pagination.geometries.map((geometry, index) => {
    const paper = { width: geometry.paper.width * PX_PER_MM, height: geometry.paper.height * PX_PER_MM }
    const parents = geometry.parents.map((parent) => {
      const resolved = furniture.get(parent.name)
      if (!resolved)
        throw new Error(`Page geometry parent "${parent.name}" has no matching pagination parent; add it to pagination.parents to clear this refusal`)
      return composerParentGeometry({ ...resolved, margin: parent.margin }, paper)
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

export function composerPageRules(geometries: ComposerPageGeometry[], print?: Print): string {
  return geometries
    .map((geometry) => {
      const press = print && usesPressLayout(print)
      const paper = press ? pressBoxes(geometry.paper, print).bleedBox : geometry.paper
      return `@page ${geometry.pageName}{size:${paper.width}mm ${paper.height}mm;margin:${press ? `${print.bleed}mm` : '0'}}`
    })
    .join('')
}
