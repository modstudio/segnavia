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

function placementAt(imposition: Imposition, paper: number, cell: number, page: number, paperSize: Imposed['paper']): Placement {
  const mm = (value: number) => toMillimeters(value, imposition.unit)
  const column = cell % imposition.columns
  const row = Math.floor(cell / imposition.columns)
  const physicalColumn = imposition.dir === 'rtl' ? imposition.columns - column - 1 : column
  const cellWidth = mm(imposition.cell.width)
  const cellHeight = mm(imposition.cell.height)
  const columnGap = mm(imposition.gap.column)
  const rowGap = mm(imposition.gap.row)
  const x =
    imposition.dir === 'rtl'
      ? paperSize.width - mm(imposition.margin.right) - cellWidth - column * (cellWidth + columnGap)
      : mm(imposition.margin.left) + column * (cellWidth + columnGap)
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

export function mirrorPlacement(front: Placement, paper: Imposed['paper'], flip: Imposition['flip'], page = front.page): Placement {
  const portrait = paper.width <= paper.height
  const axis = (flip === 'long') === portrait ? 'x' : 'y'
  const trim = mirrorBox(front.trim, paper, axis)
  const bleed =
    axis === 'x' ? { ...front.bleed, right: front.bleed.left, left: front.bleed.right } : { ...front.bleed, top: front.bleed.bottom, bottom: front.bleed.top }
  const clipped = front.clipped.map((edge) => {
    if (axis === 'x' && edge === 'left') return 'right'
    if (axis === 'x' && edge === 'right') return 'left'
    if (axis === 'y' && edge === 'top') return 'bottom'
    if (axis === 'y' && edge === 'bottom') return 'top'
    return edge
  })
  const safe = roundMillimeters(front.safeBox.x - front.trim.x)
  return {
    ...front,
    page,
    side: 'back',
    trim,
    bleed,
    bleedBox: {
      x: roundMillimeters(trim.x - bleed.left),
      y: roundMillimeters(trim.y - bleed.top),
      width: roundMillimeters(trim.width + bleed.left + bleed.right),
      height: roundMillimeters(trim.height + bleed.top + bleed.bottom),
    },
    safeBox: {
      x: roundMillimeters(trim.x + safe),
      y: roundMillimeters(trim.y + safe),
      width: roundMillimeters(trim.width - safe * 2),
      height: roundMillimeters(trim.height - safe * 2),
    },
    clipped,
  }
}

function repeatPlacements(imposition: Imposition, papers: number, paper: Imposed['paper']): Placement[] {
  const cells = imposition.columns * imposition.rows
  const placements: Placement[] = []
  for (let paperIndex = 0; paperIndex < papers; paperIndex += 1) {
    const firstCell = paperIndex === 0 ? imposition.skip : 0
    for (let cell = firstCell; cell < cells; cell += 1) placements.push(placementAt(imposition, paperIndex, cell, paperIndex, paper))
  }
  return placements
}

function sequencePlacements(imposition: Imposition, pageCount: number, papers: number, paper: Imposed['paper']): Placement[] {
  const cells = imposition.columns * imposition.rows
  const placements: Placement[] = []
  let page = 0
  for (let paperIndex = 0; paperIndex < papers; paperIndex += 1) {
    const firstCell = paperIndex === 0 ? imposition.skip : 0
    for (let cell = firstCell; cell < cells && page < pageCount; cell += 1) {
      placements.push(placementAt(imposition, paperIndex, cell, page, paper))
      page += 1
    }
  }
  return placements
}

function twoSidedRepeatPlacements(imposition: Imposition, pageCount: number, papers: number, paper: Imposed['paper']): Placement[] {
  const cells = imposition.columns * imposition.rows
  const placements: Placement[] = []
  for (let paperIndex = 0; paperIndex < papers; paperIndex += 1) {
    const firstCell = paperIndex === 0 ? imposition.skip : 0
    const fronts: Placement[] = []
    const backs: Placement[] = []
    const frontPage = paperIndex * 2
    for (let cell = firstCell; cell < cells; cell += 1) {
      const front = placementAt(imposition, paperIndex, cell, frontPage, paper)
      fronts.push(front)
      if (frontPage + 1 < pageCount) backs.push(mirrorPlacement(front, paper, imposition.flip, frontPage + 1))
    }
    placements.push(...fronts, ...backs)
  }
  return placements
}

function twoSidedSequencePlacements(imposition: Imposition, pageCount: number, papers: number, paper: Imposed['paper']): Placement[] {
  const cells = imposition.columns * imposition.rows
  const placements: Placement[] = []
  let piece = 0
  for (let paperIndex = 0; paperIndex < papers; paperIndex += 1) {
    const firstCell = paperIndex === 0 ? imposition.skip : 0
    const fronts: Placement[] = []
    const backs: Placement[] = []
    for (let cell = firstCell; cell < cells; cell += 1) {
      const frontPage = piece * 2
      if (frontPage >= pageCount) break
      const front = placementAt(imposition, paperIndex, cell, frontPage, paper)
      fronts.push(front)
      if (frontPage + 1 < pageCount) backs.push(mirrorPlacement(front, paper, imposition.flip, frontPage + 1))
      piece += 1
    }
    placements.push(...fronts, ...backs)
  }
  return placements
}

export function impose(imposition: Imposition, pageCount: number): Imposed {
  if (!Number.isInteger(pageCount) || pageCount < 0) throw new RangeError(`pageCount must be a nonnegative integer; received ${String(pageCount)}`)
  const paper = sheetMm({ paper: imposition.paper, orientation: imposition.orientation })
  const sides = imposition.sides === 'two' ? 2 : 1
  if (pageCount === 0) return { paper, papers: 0, sides, placements: [] }
  const cells = imposition.columns * imposition.rows
  const pieces = imposition.sides === 'two' ? Math.ceil(pageCount / 2) : pageCount
  const papers = imposition.fill === 'repeat' ? pieces : Math.ceil((pieces + imposition.skip) / cells)
  const placements =
    imposition.sides === 'two'
      ? imposition.fill === 'repeat'
        ? twoSidedRepeatPlacements(imposition, pageCount, papers, paper)
        : twoSidedSequencePlacements(imposition, pageCount, papers, paper)
      : imposition.fill === 'repeat'
        ? repeatPlacements(imposition, papers, paper)
        : sequencePlacements(imposition, pageCount, papers, paper)
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
