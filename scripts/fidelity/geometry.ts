import { type PaperBox, PX_PER_MM, paperPixels } from '@segnavia/format'
import type { Box } from './types.ts'

const rasterEdge = (millimeters: number, scale: number): number => Math.round(millimeters * PX_PER_MM * scale)

export function trimRasterBox(bleedBox: PaperBox, trim: PaperBox, scale: number): Box {
  const left = rasterEdge(trim.x - bleedBox.x, scale)
  const top = rasterEdge(trim.y - bleedBox.y, scale)
  const right = rasterEdge(trim.x + trim.width - bleedBox.x, scale)
  const bottom = rasterEdge(trim.y + trim.height - bleedBox.y, scale)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function bleedViewport(bleedBox: PaperBox): { width: number; height: number } {
  return { width: paperPixels(bleedBox.width), height: paperPixels(bleedBox.height) }
}
