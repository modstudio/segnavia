import { foldCellPages, foldPageCountMessage } from './fold.ts'
import type { Imposition, Page, Print } from './index.ts'
import { type PaperBox, PX_PER_MM, roundMillimeters, sheetMm, toMillimeters } from './paper.ts'

export interface MillimeterEdges {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Placement {
  page: number
  paper: number
  side: 'front' | 'back'
  column: number
  row: number
  trim: PaperBox
  bleed: MillimeterEdges
  bleedBox: PaperBox
  safeBox: PaperBox
  clipped: Array<'top' | 'right' | 'bottom' | 'left'>
}

export interface Imposed {
  paper: { width: number; height: number }
  papers: number
  sides: 1 | 2
  placements: Placement[]
}

export interface PageFit {
  flow: boolean
  width: number
  height: number | null
  scale: number
  x: number
  y: number
  // Inline is horizontal and block is vertical in this physical paper geometry.
  bands: { inline: number; block: number }
  crop: MillimeterEdges
  differs: boolean
}

export type PagePlacementKind = 'fluid' | 'growing' | 'fixed'

export interface PagePlacementLayout {
  kind: PagePlacementKind
  piece: { width: number; height: number }
  inset: boolean
  paper: PaperBox
}

const zeroCrop = () => ({ top: 0, right: 0, bottom: 0, left: 0 })

function columnWidthsMm(imposition: Imposition): number[] {
  if (imposition.fold && imposition.panels) return imposition.panels.map((width) => toMillimeters(width, imposition.unit))
  return Array.from({ length: imposition.columns }, () => toMillimeters(imposition.cell.width, imposition.unit))
}

function columnXMm(imposition: Imposition, column: number, widths: number[], paperWidth: number): number {
  const mm = (value: number) => toMillimeters(value, imposition.unit)
  const gap = mm(imposition.gap.column)
  if (imposition.dir === 'rtl') {
    let x = paperWidth - mm(imposition.margin.right)
    for (let index = 0; index <= column; index += 1) x -= widths[index] ?? 0
    for (let index = 0; index < column; index += 1) x -= gap
    return x
  }
  let x = mm(imposition.margin.left)
  for (let index = 0; index < column; index += 1) x += (widths[index] ?? 0) + gap
  return x
}

function placementAt(imposition: Imposition, paper: number, cell: number, page: number, paperSize: Imposed['paper']): Placement {
  const mm = (value: number) => toMillimeters(value, imposition.unit)
  const column = cell % imposition.columns
  const row = Math.floor(cell / imposition.columns)
  const physicalColumn = imposition.dir === 'rtl' ? imposition.columns - column - 1 : column
  const widths = columnWidthsMm(imposition)
  const cellWidth = widths[column] ?? mm(imposition.cell.width)
  const cellHeight = mm(imposition.cell.height)
  const columnGap = mm(imposition.gap.column)
  const rowGap = mm(imposition.gap.row)
  const x = columnXMm(imposition, column, widths, paperSize.width)
  const y = mm(imposition.margin.top) + row * (cellHeight + rowGap)
  const requested = mm(imposition.bleed)
  const bleed = {
    top: Math.min(requested, row > 0 ? rowGap / 2 : y),
    right: Math.min(requested, physicalColumn < imposition.columns - 1 ? columnGap / 2 : Math.max(0, paperSize.width - x - cellWidth)),
    bottom: Math.min(requested, row < imposition.rows - 1 ? rowGap / 2 : Math.max(0, paperSize.height - y - cellHeight)),
    left: Math.min(requested, physicalColumn > 0 ? columnGap / 2 : Math.max(0, x)),
  }
  const clipped = (['top', 'right', 'bottom', 'left'] as const).filter((side) => bleed[side] < requested)
  const trim = {
    x: roundMillimeters(x),
    y: roundMillimeters(y),
    width: roundMillimeters(cellWidth),
    height: roundMillimeters(cellHeight),
  }
  const roundedBleed = {
    top: roundMillimeters(bleed.top),
    right: roundMillimeters(bleed.right),
    bottom: roundMillimeters(bleed.bottom),
    left: roundMillimeters(bleed.left),
  }
  const safe = mm(imposition.safe)
  return {
    page,
    paper,
    side: 'front',
    column,
    row,
    trim,
    bleed: roundedBleed,
    bleedBox: {
      x: roundMillimeters(x - bleed.left),
      y: roundMillimeters(y - bleed.top),
      width: roundMillimeters(cellWidth + bleed.left + bleed.right),
      height: roundMillimeters(cellHeight + bleed.top + bleed.bottom),
    },
    safeBox: {
      x: roundMillimeters(x + safe),
      y: roundMillimeters(y + safe),
      width: roundMillimeters(cellWidth - safe * 2),
      height: roundMillimeters(cellHeight - safe * 2),
    },
    clipped,
  }
}

const mirrorBox = (box: PaperBox, paper: Imposed['paper'], axis: 'x' | 'y'): PaperBox =>
  axis === 'x' ? { ...box, x: roundMillimeters(paper.width - box.x - box.width) } : { ...box, y: roundMillimeters(paper.height - box.y - box.height) }

const EDGE_ORDER = ['top', 'right', 'bottom', 'left'] as const

function mirrorEdge(edge: (typeof EDGE_ORDER)[number], axis: 'x' | 'y'): (typeof EDGE_ORDER)[number] {
  if (axis === 'x') return edge === 'left' ? 'right' : edge === 'right' ? 'left' : edge
  return edge === 'top' ? 'bottom' : edge === 'bottom' ? 'top' : edge
}

function mirrorEdges(edges: MillimeterEdges, axis: 'x' | 'y'): MillimeterEdges {
  const mirrored = { ...edges }
  for (const edge of EDGE_ORDER) mirrored[mirrorEdge(edge, axis)] = edges[edge]
  return mirrored
}

export function mirrorPlacement(front: Placement, paper: Imposed['paper'], flip: Imposition['flip'], page = front.page): Placement {
  const portrait = paper.width <= paper.height
  const axis = (flip === 'long') === portrait ? 'x' : 'y'
  const mirroredClipped = new Set(front.clipped.map((edge) => mirrorEdge(edge, axis)))
  return {
    ...front,
    page,
    side: 'back',
    trim: mirrorBox(front.trim, paper, axis),
    bleed: mirrorEdges(front.bleed, axis),
    bleedBox: mirrorBox(front.bleedBox, paper, axis),
    safeBox: mirrorBox(front.safeBox, paper, axis),
    clipped: EDGE_ORDER.filter((edge) => mirroredClipped.has(edge)),
  }
}

interface PieceAssignment {
  paper: number
  cell: number
  piece: number
}

function assignPieces(imposition: Imposition, pieces: number, papers: number): PieceAssignment[] {
  const cells = imposition.columns * imposition.rows
  const assignments: PieceAssignment[] = []
  let piece = 0
  for (let paperIndex = 0; paperIndex < papers; paperIndex += 1) {
    const firstCell = paperIndex === 0 ? imposition.skip : 0
    for (let cell = firstCell; cell < cells; cell += 1) {
      const assignedPiece = imposition.fill === 'repeat' ? paperIndex : piece
      if (assignedPiece >= pieces) break
      assignments.push({ paper: paperIndex, cell, piece: assignedPiece })
      if (imposition.fill === 'sequence') piece += 1
    }
  }
  return assignments
}

function expandAssignments(imposition: Imposition, assignments: PieceAssignment[], pageCount: number, paper: Imposed['paper']): Placement[] {
  const placements: Placement[] = []
  let currentPaper = -1
  let fronts: Placement[] = []
  let backs: Placement[] = []
  const flush = () => {
    placements.push(...fronts, ...backs)
    fronts = []
    backs = []
  }
  for (const assignment of assignments) {
    if (assignment.paper !== currentPaper) {
      flush()
      currentPaper = assignment.paper
    }
    const frontPage = imposition.sides === 'two' ? assignment.piece * 2 : assignment.piece
    const front = placementAt(imposition, assignment.paper, assignment.cell, frontPage, paper)
    fronts.push(front)
    if (imposition.sides === 'two' && frontPage + 1 < pageCount) backs.push(mirrorPlacement(front, paper, imposition.flip, frontPage + 1))
  }
  flush()
  return placements
}

function imposeFold(imposition: Imposition, pageCount: number, paper: Imposed['paper']): Imposed {
  const fold = imposition.fold
  if (!fold) throw new Error('imposeFold requires a fold')
  const columns = imposition.columns
  if (pageCount !== columns * 2) throw new Error(foldPageCountMessage(fold, pageCount, columns))
  const cells = foldCellPages(fold, columns)
  const fronts: Placement[] = []
  const backs: Placement[] = []
  for (const [cell, pages] of cells.entries()) {
    if (!pages) continue
    const front = placementAt(imposition, 0, cell, pages.front, paper)
    fronts.push(front)
    backs.push(mirrorPlacement(front, paper, imposition.flip, pages.back))
  }
  return { paper, papers: 1, sides: 2, placements: [...fronts, ...backs] }
}

export function gridPlacements(imposition: Imposition): { paper: Imposed['paper']; placements: Placement[] } {
  const paper = sheetMm({ paper: imposition.paper, orientation: imposition.orientation })
  const cells = imposition.columns * imposition.rows
  return { paper, placements: Array.from({ length: cells }, (_, cell) => placementAt(imposition, 0, cell, 0, paper)) }
}

export function impose(imposition: Imposition, pageCount: number): Imposed {
  if (!Number.isInteger(pageCount) || pageCount < 0) throw new RangeError(`pageCount must be a nonnegative integer; received ${String(pageCount)}`)
  const paper = sheetMm({ paper: imposition.paper, orientation: imposition.orientation })
  const sides = imposition.sides === 'two' ? 2 : 1
  if (imposition.fold) return imposeFold(imposition, pageCount, paper)
  if (pageCount === 0) return { paper, papers: 0, sides, placements: [] }
  const cells = imposition.columns * imposition.rows
  const pieces = imposition.sides === 'two' ? Math.ceil(pageCount / 2) : pageCount
  const papers = imposition.fill === 'repeat' ? pieces : Math.ceil((pieces + imposition.skip) / cells)
  const placements = expandAssignments(imposition, assignPieces(imposition, pieces, papers), pageCount, paper)
  return { paper, papers, sides, placements }
}

function trimDiffers(page: { print?: Print }, placement: Placement): boolean {
  if (!page.print) return false
  const trim = sheetMm(page.print)
  return Math.abs(trim.width - placement.trim.width) > 0.01 || Math.abs(trim.height - placement.trim.height) > 0.01
}

export function fitPage(page: { size: Page['size']; print?: Print }, placement: Placement, fit: 'contain' | 'cover'): PageFit {
  const differs = trimDiffers(page, placement)
  if (page.size === 'fluid') {
    return {
      flow: true,
      width: placement.bleedBox.width * PX_PER_MM,
      height: null,
      scale: 1,
      x: placement.bleedBox.x,
      y: placement.bleedBox.y,
      bands: { inline: 0, block: 0 },
      crop: zeroCrop(),
      differs,
    }
  }
  if (page.size.height === 'auto') {
    return {
      flow: true,
      width: page.size.width,
      height: null,
      scale: (placement.trim.width * PX_PER_MM) / page.size.width,
      x: placement.trim.x,
      y: placement.trim.y,
      bands: { inline: 0, block: 0 },
      crop: zeroCrop(),
      differs,
    }
  }
  if (fit === 'contain') {
    const scale = Math.min((placement.trim.width * PX_PER_MM) / page.size.width, (placement.trim.height * PX_PER_MM) / page.size.height)
    const width = (page.size.width * scale) / PX_PER_MM
    const height = (page.size.height * scale) / PX_PER_MM
    const inline = (placement.trim.width - width) / 2
    const block = (placement.trim.height - height) / 2
    return {
      flow: false,
      width: page.size.width,
      height: page.size.height,
      scale,
      x: roundMillimeters(placement.trim.x + inline),
      y: roundMillimeters(placement.trim.y + block),
      bands: { inline: roundMillimeters(inline), block: roundMillimeters(block) },
      crop: zeroCrop(),
      differs,
    }
  }
  const horizontalBleed = Math.max(placement.bleed.left, placement.bleed.right)
  const verticalBleed = Math.max(placement.bleed.top, placement.bleed.bottom)
  const scale = Math.max(
    ((placement.trim.width + horizontalBleed * 2) * PX_PER_MM) / page.size.width,
    ((placement.trim.height + verticalBleed * 2) * PX_PER_MM) / page.size.height,
  )
  const width = (page.size.width * scale) / PX_PER_MM
  const height = (page.size.height * scale) / PX_PER_MM
  const x = placement.trim.x + (placement.trim.width - width) / 2
  const y = placement.trim.y + (placement.trim.height - height) / 2
  return {
    flow: false,
    width: page.size.width,
    height: page.size.height,
    scale,
    x: roundMillimeters(x),
    y: roundMillimeters(y),
    bands: { inline: 0, block: 0 },
    crop: {
      top: roundMillimeters(Math.max(0, placement.bleedBox.y - y)),
      right: roundMillimeters(Math.max(0, x + width - placement.bleedBox.x - placement.bleedBox.width)),
      bottom: roundMillimeters(Math.max(0, y + height - placement.bleedBox.y - placement.bleedBox.height)),
      left: roundMillimeters(Math.max(0, placement.bleedBox.x - x)),
    },
    differs,
  }
}

export function pagePlacementLayout(size: Page['size'], placement: Placement, fit: PageFit): PagePlacementLayout {
  if (size === 'fluid') {
    return {
      kind: 'fluid',
      piece: { width: placement.bleedBox.width * PX_PER_MM, height: placement.bleedBox.height * PX_PER_MM },
      inset: true,
      paper: placement.bleedBox,
    }
  }
  if (size.height === 'auto') {
    return {
      kind: 'growing',
      piece: { width: size.width, height: (placement.trim.height * PX_PER_MM) / fit.scale },
      inset: false,
      paper: { x: fit.x, y: fit.y, width: placement.trim.width, height: placement.trim.height },
    }
  }
  return {
    kind: 'fixed',
    piece: { width: size.width, height: size.height },
    inset: false,
    paper: {
      x: fit.x,
      y: fit.y,
      width: (size.width * fit.scale) / PX_PER_MM,
      height: (size.height * fit.scale) / PX_PER_MM,
    },
  }
}
