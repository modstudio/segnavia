// Annotation geometry: pure functions from measured element boxes to the
// ring, badge and arrow a viewer draws. Everything is in viewport CSS pixels.

import type { Annotation, Box, TextDirection } from '@segnavia/format'

export const SIDES = ['left', 'right', 'top', 'bottom'] as const
export type Side = (typeof SIDES)[number]

const RING_PADDING = 6
const ARROW_LENGTH = 96
const ARROW_GAP = 10
const BADGE_OFFSET = 4
const EDGE_MARGIN = 8
// Below this much free space an arrow and its label cannot be drawn whole.
export const MIN_ARROW_ROOM = 72

export interface AnnotationSpec {
  number?: number
  arrow?: Side | 'auto'
  label?: string
  highlight?: boolean
}

export interface Viewport {
  width: number
  height: number
}

export function padBox(box: Box, padding = RING_PADDING): Box {
  return { x: box.x - padding, y: box.y - padding, width: box.width + padding * 2, height: box.height + padding * 2 }
}

export function roomAround(box: Box, viewport: Viewport): Record<Side, number> {
  return {
    left: box.x,
    right: viewport.width - (box.x + box.width),
    top: box.y,
    bottom: viewport.height - (box.y + box.height),
  }
}

// The named side, or the one with most room, the same way on every run. A named side is drawn there or
// not at all: a silently moved arrow could point at something the narration
// does not describe.
export function chooseArrowSide(box: Box, viewport: Viewport, preferred: Side | 'auto' = 'auto', direction: TextDirection = 'ltr'): Side {
  const room = roomAround(box, viewport)
  if (preferred !== 'auto') {
    if (room[preferred] < MIN_ARROW_ROOM) {
      throw new Error(`There is ${Math.round(room[preferred])}px of room on the ${preferred}; an arrow needs ${MIN_ARROW_ROOM}px.`)
    }
    return preferred
  }
  // Ties go to the earlier side in reading order, mirrored for right to left.
  const order: readonly Side[] = direction === 'rtl' ? ['right', 'left', 'top', 'bottom'] : SIDES
  return order.reduce((best, side) => (room[side] > room[best] ? side : best), order[0] as Side)
}

export function arrowGeometry(ring: Box, side: Side, viewport: Viewport) {
  const center = { x: ring.x + ring.width / 2, y: ring.y + ring.height / 2 }
  const room = roomAround(ring, viewport)
  const span = Math.max(24, Math.min(ARROW_LENGTH, room[side] - ARROW_GAP - EDGE_MARGIN))
  const left = ring.x - ARROW_GAP
  const right = ring.x + ring.width + ARROW_GAP
  const top = ring.y - ARROW_GAP
  const bottom = ring.y + ring.height + ARROW_GAP
  switch (side) {
    case 'left':
      return { head: { x: left, y: center.y }, tail: { x: left - span, y: center.y } }
    case 'right':
      return { head: { x: right, y: center.y }, tail: { x: right + span, y: center.y } }
    case 'top':
      return { head: { x: center.x, y: top }, tail: { x: center.x, y: top - span } }
    case 'bottom':
      return { head: { x: center.x, y: bottom }, tail: { x: center.x, y: bottom + span } }
  }
}

// The badge sits on the top corner at the inline end: top right on a left to
// right screen, top left on a right to left one.
export function layoutAnnotation(box: Box, spec: AnnotationSpec, viewport: Viewport, direction: TextDirection = 'ltr'): Annotation {
  const ring = padBox(box)
  const wantsArrow = spec.arrow !== undefined || spec.label !== undefined
  const arrow = wantsArrow
    ? { ...arrowGeometry(ring, chooseArrowSide(ring, viewport, spec.arrow ?? 'auto', direction), viewport), label: spec.label ?? null }
    : null
  const badgeX = direction === 'rtl' ? ring.x + BADGE_OFFSET : ring.x + ring.width - BADGE_OFFSET
  const badge = spec.number === undefined ? null : { center: { x: badgeX, y: ring.y + BADGE_OFFSET }, number: spec.number }
  return { ring: spec.highlight === false ? null : ring, badge, arrow }
}
