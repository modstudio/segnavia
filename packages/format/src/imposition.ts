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

export function impose(imposition: Imposition, pageCount: number): Imposed {
  if (!Number.isInteger(pageCount) || pageCount < 0) throw new RangeError(`pageCount must be a nonnegative integer; received ${String(pageCount)}`)
  const paper = sheetMm({ paper: imposition.paper, orientation: imposition.orientation })
  if (pageCount === 0) return { paper, papers: 0, placements: [] }
  const cells = imposition.columns * imposition.rows
  const papers = imposition.fill === 'repeat' ? pageCount : Math.ceil((pageCount + imposition.skip) / cells)
  const placements = imposition.fill === 'repeat' ? repeatPlacements(imposition, papers, paper) : sequencePlacements(imposition, pageCount, papers, paper)
  return { paper, papers, placements }
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
