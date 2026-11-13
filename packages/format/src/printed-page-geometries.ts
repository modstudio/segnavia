import type { Print } from './print.ts'
import { resolveParentPages, type ParentPage, type ResolvedParentPage } from './printed-pages.ts'
import { sheetMm } from './paper.ts'
import type { PageGeometry, StyleSheet } from './style-sheet.ts'

const ZERO_MARGIN = { blockStart: 0, blockEnd: 0, inlineStart: 0, inlineEnd: 0 }

export interface ResolvedPrintedPageGeometry {
  name?: string
  paper: { width: number; height: number }
  columns: { count: number; gap: number }
  parents: ResolvedParentPage[]
}

export interface PrintedGeometrySource {
  print?: Print
  style?: StyleSheet
  printedPages?: { parents: ParentPage[] }
}

function resolvedParents(parents: ParentPage[], margin: typeof ZERO_MARGIN): ResolvedParentPage[] {
  return resolveParentPages(parents).map((parent) => ({
    ...parent,
    margin: parents.find((candidate) => candidate.name === parent.name)?.margin === undefined ? margin : parent.margin,
  }))
}

function resolve(source: PrintedGeometrySource, name: string | undefined, geometry: Pick<PageGeometry, 'paper' | 'orientation' | 'margin' | 'columns'>) {
  return {
    ...(name === undefined ? {} : { name }),
    paper: sheetMm(geometry),
    columns: geometry.columns ?? { count: 1, gap: 0 },
    parents: resolvedParents(source.printedPages?.parents ?? [], geometry.margin),
  }
}

export function resolvePrintedPageGeometry(source: PrintedGeometrySource, name?: string): ResolvedPrintedPageGeometry | undefined {
  if (!source.print) return undefined
  if (name === undefined) {
    return resolve(source, undefined, {
      paper: source.print.paper,
      orientation: source.print.orientation,
      margin: source.print.margin ?? ZERO_MARGIN,
    })
  }
  const geometry = source.style?.pageGeometries?.[name]
  return geometry ? resolve(source, name, geometry) : undefined
}

export function printedPageGeometries(source: PrintedGeometrySource): ResolvedPrintedPageGeometry[] {
  const base = resolvePrintedPageGeometry(source)
  if (!base) return []
  return [
    base,
    ...Object.keys(source.style?.pageGeometries ?? {}).flatMap((name) => {
      const geometry = resolvePrintedPageGeometry(source, name)
      return geometry ? [geometry] : []
    }),
  ]
}
