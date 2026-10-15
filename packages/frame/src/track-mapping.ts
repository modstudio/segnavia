import type { DeckTimeline } from './timeline.ts'

export const TRACK_MARKER_WIDTH = 6
export const TRACK_GAP_WIDTH = 4

export interface TrackTarget {
  index: number
  localMs: number | null
}

const slideTarget = (timeline: DeckTimeline, index: number, localMs: number): TrackTarget => ({
  index,
  localMs: timeline.slides[index]?.untimed ? null : localMs,
})

export function trackMsAt(
  position: number,
  width: number,
  timeline: DeckTimeline,
  direction: 'ltr' | 'rtl',
  markerWidth = TRACK_MARKER_WIDTH,
  gapWidth = TRACK_GAP_WIDTH,
): number {
  const target = trackTargetAt(position, width, timeline, direction, markerWidth, gapWidth)
  const slide = timeline.slides[target.index]
  return (slide?.startMs ?? 0) + (target.localMs ?? 0)
}

export function trackTargetAt(
  position: number,
  width: number,
  timeline: DeckTimeline,
  direction: 'ltr' | 'rtl',
  markerWidth = TRACK_MARKER_WIDTH,
  gapWidth = TRACK_GAP_WIDTH,
): TrackTarget {
  if (width <= 0 || timeline.slides.length === 0) return { index: 0, localMs: 0 }
  const offset = Math.max(0, Math.min(width, direction === 'rtl' ? width - position : position))
  const markers = timeline.slides.filter((slide) => slide.untimed).length
  const timedWidth = Math.max(1, width - markers * markerWidth - Math.max(0, timeline.slides.length - 1) * gapWidth)
  let cursor = 0
  for (const [index, slide] of timeline.slides.entries()) {
    if (slide.untimed) {
      if (offset <= cursor + markerWidth) return slideTarget(timeline, index, 0)
      cursor += markerWidth
    } else {
      const segmentWidth = timedWidth * ((slide.durationMs ?? 0) / timeline.totalMs)
      if (offset <= cursor + segmentWidth) return { index, localMs: ((offset - cursor) / segmentWidth) * (slide.durationMs ?? 0) }
      cursor += segmentWidth
    }
    if (index < timeline.slides.length - 1) {
      if (offset <= cursor + gapWidth) {
        return slideTarget(timeline, index + 1, 0)
      }
      cursor += gapWidth
    }
  }
  const index = timeline.slides.length - 1
  return slideTarget(timeline, index, timeline.slides[index]?.durationMs ?? 0)
}
