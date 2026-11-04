export interface Position {
  index: number
  ms: number
}

export interface PlayedSpan {
  startMs: number
  endMs: number
}

export interface WatchedSlide {
  durationMs: number | null
  spans: PlayedSpan[]
  shown: boolean
}

export interface WatchedModel {
  slides: WatchedSlide[]
}

export interface WatchedState {
  ms: number
  share: number
  reach: Position
  complete: boolean
}

export function mergeSpans(spans: readonly PlayedSpan[]): PlayedSpan[] {
  const ordered = spans
    .filter(({ startMs, endMs }) => endMs > startMs)
    .map(({ startMs, endMs }) => ({ startMs, endMs }))
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
  const merged: PlayedSpan[] = []
  for (const span of ordered) {
    const previous = merged.at(-1)
    if (!previous || span.startMs > previous.endMs) merged.push(span)
    else previous.endMs = Math.max(previous.endMs, span.endMs)
  }
  return merged
}

export function createWatchedModel(durations: readonly (number | null)[]): WatchedModel {
  return { slides: durations.map((durationMs) => ({ durationMs, spans: [], shown: false })) }
}

export function addWatchedSpan(model: WatchedModel, index: number, startMs: number, endMs: number): WatchedModel {
  const slide = model.slides[index]
  if (!slide || slide.durationMs === null) return model
  const span = { startMs: Math.max(0, Math.min(slide.durationMs, startMs)), endMs: Math.max(0, Math.min(slide.durationMs, endMs)) }
  if (span.endMs <= span.startMs) return model
  const slides = [...model.slides]
  slides[index] = { ...slide, spans: mergeSpans([...slide.spans, span]) }
  return { slides }
}

export function showWatchedSlide(model: WatchedModel, index: number): WatchedModel {
  const slide = model.slides[index]
  if (!slide || slide.durationMs !== null || slide.shown) return model
  const slides = [...model.slides]
  slides[index] = { ...slide, shown: true }
  return { slides }
}

export function watchedSlideComplete(slide: WatchedSlide): boolean {
  if (slide.durationMs === null) return slide.shown
  return slide.durationMs === 0 || (slide.spans[0]?.startMs === 0 && slide.spans[0].endMs >= slide.durationMs)
}

function prefixEnd(slide: WatchedSlide): number {
  const first = slide.spans[0]
  return first?.startMs === 0 ? first.endMs : 0
}

export function watchedState(model: WatchedModel, completeAt = 1): WatchedState {
  let ms = 0
  let reach: Position = { index: model.slides.length, ms: 0 }
  for (const [index, slide] of model.slides.entries()) {
    ms += slide.spans.reduce((sum, span) => sum + span.endMs - span.startMs, 0)
    if (reach.index === model.slides.length && !watchedSlideComplete(slide)) reach = { index, ms: slide.durationMs === null ? 0 : prefixEnd(slide) }
  }
  const timedDuration = model.slides.reduce((sum, slide) => sum + (slide.durationMs ?? 0), 0)
  const durationWeights = timedDuration > 0
  const weight = (slide: WatchedSlide) => (durationWeights ? (slide.durationMs ?? 0) : 1)
  const totalWeight = model.slides.reduce((sum, slide) => sum + weight(slide), 0)
  const watchedWeight = durationWeights ? ms : model.slides.reduce((sum, slide) => sum + (watchedSlideComplete(slide) ? weight(slide) : 0), 0)
  const share = totalWeight === 0 ? 0 : watchedWeight / totalWeight
  return { ms, share, reach, complete: share >= completeAt }
}
