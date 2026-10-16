import type { Annotation, Box, ImageFit, Size } from '@segnavia/format'

export interface ImagePlacement {
  scale: number
  x: number
  y: number
  framed: boolean
}

export const FRAME_INSET = 56
export const FRAME_RADIUS = 14
export const FRAME_SHADOW_OFFSET = 4
export const FRAME_SHADOW_BLUR = 18
export const FRAME_HAIRLINE = 1
export const FRAME_SHADOW_COLOR = 'rgba(15,23,42,.18)'
export const FRAME_HAIRLINE_COLOR = 'rgba(15,23,42,.08)'
export const FRAME_REFERENCE_SIZE = 720

export function frameUnit(slide: Size): number {
  return Math.min(slide.width, slide.height) / FRAME_REFERENCE_SIZE
}

export interface ImageFrameStyle {
  borderRadius: string
  boxShadow: string
}

export function imageFrameStyle(placement: ImagePlacement, slide: Size): ImageFrameStyle | undefined {
  if (!placement.framed) return undefined
  const divide = (value: number) => (value * frameUnit(slide)) / placement.scale
  return {
    borderRadius: `${divide(FRAME_RADIUS)}px`,
    boxShadow: `0 ${divide(FRAME_SHADOW_OFFSET)}px ${divide(FRAME_SHADOW_BLUR)}px ${FRAME_SHADOW_COLOR}, 0 0 0 ${divide(FRAME_HAIRLINE)}px ${FRAME_HAIRLINE_COLOR}`,
  }
}

export function fitImage(slide: Size, image: Size, fit: ImageFit, focus?: Box, frame = false): ImagePlacement {
  const contain = Math.min(slide.width / image.width, slide.height / image.height)
  const cover = Math.max(slide.width / image.width, slide.height / image.height)
  let placement: ImagePlacement
  if (fit === 'contain') {
    placement = { scale: contain, x: (slide.width - image.width * contain) / 2, y: (slide.height - image.height * contain) / 2, framed: false }
  } else if (fit === 'width') {
    const scale = slide.width / image.width
    placement = { scale, x: 0, y: image.height * scale < slide.height ? (slide.height - image.height * scale) / 2 : 0, framed: false }
  } else if (fit === 'cover' || !focus) {
    placement = { scale: cover, x: (slide.width - image.width * cover) / 2, y: (slide.height - image.height * cover) / 2, framed: false }
  } else {
    const focusScale = Math.min(slide.width / focus.width, slide.height / focus.height)
    const scale = Math.max(contain, Math.min(cover, focusScale))
    const placeAxis = (slideAxis: number, imageAxis: number, focusStart: number, focusSize: number) => {
      const scaled = imageAxis * scale
      if (scaled < slideAxis) return (slideAxis - scaled) / 2
      const centered = slideAxis / 2 - (focusStart + focusSize / 2) * scale
      return Math.max(slideAxis - scaled, Math.min(0, centered))
    }
    placement = {
      scale,
      x: placeAxis(slide.width, image.width, focus.x, focus.width),
      y: placeAxis(slide.height, image.height, focus.y, focus.height),
      framed: false,
    }
  }
  const epsilon = 0.5
  const covers =
    placement.x <= epsilon &&
    placement.y <= epsilon &&
    placement.x + image.width * placement.scale >= slide.width - epsilon &&
    placement.y + image.height * placement.scale >= slide.height - epsilon
  if (!frame || covers) return placement
  const inset = FRAME_INSET * frameUnit(slide)
  const inner = { width: slide.width - 2 * inset, height: slide.height - 2 * inset }
  const framed = fitImage(inner, image, fit, focus)
  return { ...framed, x: framed.x + inset, y: framed.y + inset, framed: true }
}

// svg.ts renders arrow labels at 18 px, centered on the tail with the baseline 10 px above it.
const ARROW_LABEL_FONT_SIZE = 18
const ARROW_LABEL_CHARACTER_WIDTH = ARROW_LABEL_FONT_SIZE * 0.6
const ARROW_LABEL_WIDTH_PADDING = 8
const ARROW_LABEL_TOP_OFFSET = 30
const ARROW_LABEL_HEIGHT = 24

function annotationBoxes(annotation: Annotation): Box[] {
  const boxes: Box[] = []
  if (annotation.ring) boxes.push(annotation.ring)
  if (annotation.badge) boxes.push({ x: annotation.badge.center.x - 15, y: annotation.badge.center.y - 15, width: 30, height: 30 })
  if (annotation.arrow) {
    const { head, tail } = annotation.arrow
    boxes.push({ x: Math.min(head.x, tail.x), y: Math.min(head.y, tail.y), width: Math.abs(head.x - tail.x), height: Math.abs(head.y - tail.y) })
    if (annotation.arrow.label) {
      const width = annotation.arrow.label.length * ARROW_LABEL_CHARACTER_WIDTH + ARROW_LABEL_WIDTH_PADDING
      boxes.push({ x: tail.x - width / 2, y: tail.y - ARROW_LABEL_TOP_OFFSET, width, height: ARROW_LABEL_HEIGHT })
    }
  }
  return boxes
}

export function annotationFocusBox(image: Size, annotations: Annotation[]): Box | undefined {
  const boxes = annotations.flatMap(annotationBoxes)
  if (boxes.length === 0) return undefined
  const left = Math.max(0, Math.min(...boxes.map((box) => box.x)) - 24)
  const top = Math.max(0, Math.min(...boxes.map((box) => box.y)) - 24)
  const right = Math.min(image.width, Math.max(...boxes.map((box) => box.x + box.width)) + 24)
  const bottom = Math.min(image.height, Math.max(...boxes.map((box) => box.y + box.height)) + 24)
  return { x: left, y: top, width: right - left, height: bottom - top }
}
