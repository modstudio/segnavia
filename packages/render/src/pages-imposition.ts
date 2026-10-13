import { fitPage, type Imposed, type Page, type PagePlacementLayout, type Placement, pagePlacementLayout } from '@segnavia/format'
import { pdfBox } from './pdf-geometry.ts'

export interface PiecePlacement {
  placement: Placement
  layout: PagePlacementLayout
}

export interface PieceGroup {
  key: string
  page: number
  placements: PiecePlacement[]
}

export interface PieceGeometry {
  viewport: { width: number; height: number }
  pdf: { width: string; height: string }
  padding?: Placement['bleed']
}

const geometryKey = (page: number, pageValue: Page, placement: Placement) =>
  pageValue.size === 'fluid'
    ? JSON.stringify([
        page,
        placement.bleedBox.width,
        placement.bleedBox.height,
        placement.bleed.top,
        placement.bleed.right,
        placement.bleed.bottom,
        placement.bleed.left,
      ])
    : String(page)

export function groupPieces(pages: Page[], imposed: Imposed, mode: 'contain' | 'cover'): PieceGroup[] {
  const groups = new Map<string, PieceGroup>()
  for (const placement of imposed.placements) {
    const page = pages[placement.page]
    if (!page) throw new RangeError(`The placement names missing page ${placement.page}.`)
    const fit = fitPage(page, placement, mode)
    const layout = pagePlacementLayout(page.size, placement, fit)
    const key = geometryKey(placement.page, page, placement)
    const group = groups.get(key) ?? { key, page: placement.page, placements: [] }
    group.placements.push({ placement, layout })
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function pieceGeometry(item: PiecePlacement): PieceGeometry {
  const { placement, layout } = item
  if (layout.kind === 'fluid') {
    return {
      viewport: { width: Math.round(layout.piece.width), height: Math.round(layout.piece.height) },
      pdf: { width: `${layout.paper.width}mm`, height: `${layout.paper.height}mm` },
      padding: layout.inset ? placement.bleed : undefined,
    }
  }
  return {
    viewport: { width: layout.piece.width, height: Math.round(layout.piece.height) },
    pdf: { width: `${layout.piece.width}px`, height: `${layout.piece.height}px` },
  }
}

export function placementPdfGeometry(
  placement: Placement,
  layout: PagePlacementLayout,
  paperHeight: number,
): { draw: { x: number; y: number; width: number; height: number }; clip: { x: number; y: number; width: number; height: number } } {
  return {
    draw: pdfBox(layout.paper, paperHeight),
    clip: pdfBox(placement.bleedBox, paperHeight),
  }
}
