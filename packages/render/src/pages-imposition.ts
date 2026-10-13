import { fitPage, type Imposed, MM_PER_PT, type Page, type PageFit, type Placement, PX_PER_MM } from '@segnavia/format'

export interface PiecePlacement {
  placement: Placement
  fit: PageFit
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
    const key = geometryKey(placement.page, page, placement)
    const group = groups.get(key) ?? { key, page: placement.page, placements: [] }
    group.placements.push({ placement, fit })
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function pieceGeometry(page: Page, item: PiecePlacement): PieceGeometry {
  const { placement, fit } = item
  if (page.size === 'fluid') {
    return {
      viewport: { width: Math.round(fit.width), height: Math.round(placement.bleedBox.height * PX_PER_MM) },
      pdf: { width: `${placement.bleedBox.width}mm`, height: `${placement.bleedBox.height}mm` },
      padding: placement.bleed,
    }
  }
  const height = page.size.height === 'auto' ? (placement.trim.height * PX_PER_MM) / fit.scale : page.size.height
  return { viewport: { width: page.size.width, height: Math.round(height) }, pdf: { width: `${page.size.width}px`, height: `${height}px` } }
}

const pt = (millimeters: number) => millimeters / MM_PER_PT

export function placementPdfGeometry(
  placement: Placement,
  fit: PageFit,
  paperHeight: number,
): { draw: { x: number; y: number; width: number; height: number }; clip: { x: number; y: number; width: number; height: number } } {
  const fluid = fit.flow && Math.abs(fit.x - placement.bleedBox.x) < 0.001
  const widthMm = fluid ? placement.bleedBox.width : (fit.width * fit.scale) / PX_PER_MM
  const heightMm = fluid ? placement.bleedBox.height : fit.height === null ? placement.trim.height : (fit.height * fit.scale) / PX_PER_MM
  return {
    draw: { x: pt(fit.x), y: pt(paperHeight - fit.y - heightMm), width: pt(widthMm), height: pt(heightMm) },
    clip: {
      x: pt(placement.bleedBox.x),
      y: pt(paperHeight - placement.bleedBox.y - placement.bleedBox.height),
      width: pt(placement.bleedBox.width),
      height: pt(placement.bleedBox.height),
    },
  }
}
