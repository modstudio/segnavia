import { RenderRefusedError } from './errors.ts'

export interface PdfBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ReceivedPageFactsInput {
  mediaBox: PdfBox
  cropBox?: PdfBox
  trimBox?: PdfBox
  rotate: number
  page: number
}

export interface ReceivedPageFacts {
  frame: PdfBox
  viewed: { media: { width: number; height: number }; frame: PdfBox }
  matrix: readonly [number, number, number, number, number, number]
}

function clipped(box: PdfBox, media: PdfBox): PdfBox {
  const x = Math.max(box.x, media.x)
  const y = Math.max(box.y, media.y)
  const right = Math.min(box.x + box.width, media.x + media.width)
  const top = Math.min(box.y + box.height, media.y + media.height)
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, top - y) }
}

function normalizedRotation(value: number): 0 | 90 | 180 | 270 {
  const normalized = ((value % 360) + 360) % 360
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0
}

function viewedBox(box: PdfBox, media: PdfBox, rotate: 0 | 90 | 180 | 270): PdfBox {
  const x = box.x - media.x
  const y = box.y - media.y
  if (rotate === 90) return { x: y, y: media.width - x - box.width, width: box.height, height: box.width }
  if (rotate === 180) {
    return { x: media.width - x - box.width, y: media.height - y - box.height, width: box.width, height: box.height }
  }
  if (rotate === 270) return { x: media.height - y - box.height, y: x, width: box.height, height: box.width }
  return { x, y, width: box.width, height: box.height }
}

export function receivedPageFacts(input: ReceivedPageFactsInput): ReceivedPageFacts {
  const { mediaBox: media, page } = input
  const frame = clipped(input.trimBox ?? input.cropBox ?? media, media)
  if (frame.width === 0 || frame.height === 0) {
    throw new RenderRefusedError(
      `Received PDF page ${page} has a zero-area trim, crop or media frame after clipping to its media box; repair that page's boxes to clear this refusal.`,
    )
  }
  const rotate = normalizedRotation(input.rotate)
  const swapped = rotate === 90 || rotate === 270
  const matrix: ReceivedPageFacts['matrix'] =
    rotate === 90
      ? [0, 1, -1, 0, media.x + media.width, media.y]
      : rotate === 180
        ? [-1, 0, 0, -1, media.x + media.width, media.y + media.height]
        : rotate === 270
          ? [0, -1, 1, 0, media.x, media.y + media.height]
          : [1, 0, 0, 1, media.x, media.y]
  return {
    frame,
    viewed: {
      media: { width: swapped ? media.height : media.width, height: swapped ? media.width : media.height },
      frame: viewedBox(frame, media, rotate),
    },
    matrix,
  }
}
