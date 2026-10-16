import type { Annotation, Box, ImageFit, Size } from '@segnavia/format'

export interface ImagePlacement {
  scale: number
  x: number
  y: number
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

function annotationBoxes(annotation: Annotation): Box[] {
  const boxes: Box[] = []
  if (annotation.ring) boxes.push(annotation.ring)
  if (annotation.badge) boxes.push({ x: annotation.badge.center.x - 15, y: annotation.badge.center.y - 15, width: 30, height: 30 })
  if (annotation.arrow) {
    const { head, tail } = annotation.arrow
    boxes.push({ x: Math.min(head.x, tail.x), y: Math.min(head.y, tail.y), width: Math.abs(head.x - tail.x), height: Math.abs(head.y - tail.y) })
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
