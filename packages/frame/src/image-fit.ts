import type { Annotation, Box, ImageFit, Size } from '@segnavia/format'

export interface ImagePlacement {
  scale: number
  x: number
  y: number
}

export interface ImageLayerStyles {
  layer: { width: string; height: string; transform: string }
  image: { width: string; height: string }
}

export function imageLayerStyles(natural: Size, placement: ImagePlacement): ImageLayerStyles {
  const width = `${natural.width}px`
  const height = `${natural.height}px`
  return {
    layer: {
      width,
      height,
      transform: `translate(${placement.x}px,${placement.y}px) scale(${placement.scale})`,
    },
    image: { width, height },
  }
}

export function fitImage(slide: Size, image: Size, fit: ImageFit, focus?: Box): ImagePlacement {
  const contain = Math.min(slide.width / image.width, slide.height / image.height)
  const cover = Math.max(slide.width / image.width, slide.height / image.height)
  if (fit === 'contain') {
    return { scale: contain, x: (slide.width - image.width * contain) / 2, y: (slide.height - image.height * contain) / 2 }
  }
  if (fit === 'width') {
    const scale = slide.width / image.width
    return { scale, x: 0, y: image.height * scale < slide.height ? (slide.height - image.height * scale) / 2 : 0 }
  }
  if (fit === 'cover' || !focus) {
    return { scale: cover, x: (slide.width - image.width * cover) / 2, y: (slide.height - image.height * cover) / 2 }
  }
  const focusScale = Math.min(slide.width / focus.width, slide.height / focus.height)
  const scale = Math.max(contain, Math.min(cover, focusScale))
  const placeAxis = (slideAxis: number, imageAxis: number, focusStart: number, focusSize: number) => {
    const scaled = imageAxis * scale
    if (scaled < slideAxis) return (slideAxis - scaled) / 2
    const centered = slideAxis / 2 - (focusStart + focusSize / 2) * scale
    return Math.max(slideAxis - scaled, Math.min(0, centered))
  }
  return {
    scale,
    x: placeAxis(slide.width, image.width, focus.x, focus.width),
    y: placeAxis(slide.height, image.height, focus.y, focus.height),
  }
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
