import { MM_PER_PT, PX_PER_MM } from '@segnavia/format'

const pt = (millimeters: number) => millimeters / MM_PER_PT
const pixelPt = (pixels: number) => pt(pixels / PX_PER_MM)

function pdfPoint(x: number, y: number, mediaHeight: number): { x: number; y: number } {
  return { x: pt(x), y: pt(mediaHeight - y) }
}

export function pdfBox(
  box: { x: number; y: number; width: number; height: number },
  mediaHeight: number,
): { x: number; y: number; width: number; height: number } {
  const bottomLeft = pdfPoint(box.x, box.y + box.height, mediaHeight)
  return { ...bottomLeft, width: pt(box.width), height: pt(box.height) }
}

export function pdfPixelBox(
  box: { x: number; y: number; width: number; height: number },
  mediaHeight: number,
): { x: number; y: number; width: number; height: number } {
  return { x: pixelPt(box.x), y: pixelPt(mediaHeight - box.y - box.height), width: pixelPt(box.width), height: pixelPt(box.height) }
}

export { pdfPoint, pixelPt, pt }
