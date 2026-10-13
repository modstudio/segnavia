import { MM_PER_PT } from '@segnavia/format'

const pt = (millimeters: number) => millimeters / MM_PER_PT

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

export { pdfPoint, pt }
