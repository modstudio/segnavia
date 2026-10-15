import type { DeckTimeline } from './timeline.ts'

export function trackMsAt(position: number, width: number, timeline: DeckTimeline, direction: 'ltr' | 'rtl', markerWidth = 6): number {
  if (timeline.totalMs <= 0 || width <= 0) return 0
  const offset = Math.max(0, Math.min(width, direction === 'rtl' ? width - position : position))
  const markers = timeline.slides.filter((slide) => slide.untimed).length
  const timedWidth = Math.max(1, width - markers * markerWidth)
  let cursor = 0
  for (const slide of timeline.slides) {
    if (slide.untimed) {
      if (offset <= cursor + markerWidth) return slide.startMs
      cursor += markerWidth
      continue
    }
    const segmentWidth = timedWidth * ((slide.durationMs ?? 0) / timeline.totalMs)
    if (offset <= cursor + segmentWidth) return slide.startMs + ((offset - cursor) / segmentWidth) * (slide.durationMs ?? 0)
    cursor += segmentWidth
  }
  return timeline.totalMs
}
