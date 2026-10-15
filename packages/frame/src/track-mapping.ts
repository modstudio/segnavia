import type { DeckTimeline } from './timeline.ts'

export function trackMsAt(position: number, width: number, timeline: DeckTimeline, direction: 'ltr' | 'rtl', markerWidth = 6, gapWidth = 4): number {
  if (timeline.totalMs <= 0 || width <= 0) return 0
  const offset = Math.max(0, Math.min(width, direction === 'rtl' ? width - position : position))
  const markers = timeline.slides.filter((slide) => slide.untimed).length
  const timedWidth = Math.max(1, width - markers * markerWidth - Math.max(0, timeline.slides.length - 1) * gapWidth)
  let cursor = 0
  for (const [index, slide] of timeline.slides.entries()) {
    if (slide.untimed) {
      if (offset <= cursor + markerWidth) return slide.startMs
      cursor += markerWidth
    } else {
      const segmentWidth = timedWidth * ((slide.durationMs ?? 0) / timeline.totalMs)
      if (offset <= cursor + segmentWidth) return slide.startMs + ((offset - cursor) / segmentWidth) * (slide.durationMs ?? 0)
      cursor += segmentWidth
    }
    if (index < timeline.slides.length - 1) {
      if (offset <= cursor + gapWidth) return timeline.slides[index + 1]?.startMs ?? timeline.totalMs
      cursor += gapWidth
    }
  }
  return timeline.totalMs
}
