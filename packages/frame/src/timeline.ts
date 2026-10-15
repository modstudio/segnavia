// What a playing slide shows at a moment: the word being spoken and the
// annotations whose cues have arrived. Pure, so the viewer, a test and a
// future video export all read the same answer from the same narration.

import type { Cue, Deck, Narration, Slide } from '@segnavia/format'

export interface Moment {
  word: number | null
  annotations: number[]
  ended: boolean
}

export type SlidePhase = 'before' | 'narration' | 'after' | 'hold'

export interface SlideMoment {
  word: number | null
  shown: number[]
  phase: SlidePhase
}

export interface TimelineSlide {
  startMs: number
  durationMs: number | null
  untimed: boolean
}

export interface DeckTimeline {
  slides: TimelineSlide[]
  totalMs: number
}

export interface TimelinePosition {
  index: number
  localMs: number
  untimed: boolean
}

export function slideDurationMs(slide: Slide): number | null {
  if (slide.narration) return (slide.beforeMs ?? 0) + slide.narration.durationMs + (slide.afterMs ?? 0)
  return slide.holdMs ?? null
}

export function deckTimeline(deck: Pick<Deck, 'slides'>): DeckTimeline {
  let totalMs = 0
  const slides = deck.slides.map((slide) => {
    const durationMs = slideDurationMs(slide)
    const entry = { startMs: totalMs, durationMs, untimed: durationMs === null }
    totalMs += durationMs ?? 0
    return entry
  })
  return { slides, totalMs }
}

export function positionAt(timeline: DeckTimeline, deckMs: number): TimelinePosition {
  const target = Math.max(0, Math.min(timeline.totalMs, deckMs))
  let index = timeline.slides.findIndex((entry) => entry.untimed && entry.startMs === target)
  if (index < 0) index = timeline.slides.findIndex((entry) => entry.durationMs !== null && target >= entry.startMs && target < entry.startMs + entry.durationMs)
  if (index < 0) index = Math.max(0, timeline.slides.length - 1)
  const entry = timeline.slides[index]
  return { index, localMs: entry?.untimed ? 0 : target - (entry?.startMs ?? 0), untimed: entry?.untimed ?? true }
}

export function slideStateAt(slide: Slide, ms: number): SlideMoment {
  const position = Math.max(0, ms)
  if (!slide.narration) return { word: null, shown: [], phase: 'hold' }
  const beforeMs = slide.beforeMs ?? 0
  if (position < beforeMs) return { word: null, shown: [], phase: 'before' }
  const narrationMs = position - beforeMs
  if (narrationMs < slide.narration.durationMs) {
    const word = wordAt(slide.narration, narrationMs)
    return { word, shown: annotationsAt(slide.narration.cues, word), phase: 'narration' }
  }
  const word = wordAt(slide.narration, slide.narration.durationMs)
  return { word, shown: annotationsAt(slide.narration.cues, word), phase: 'after' }
}

// The word whose span holds the time, or during a pause the word just spoken,
// so the caption never blinks off between words.
export function wordAt(narration: Pick<Narration, 'words'>, ms: number): number | null {
  let spoken: number | null = null
  for (const [index, word] of narration.words.entries()) {
    if (word.startMs > ms) break
    spoken = index
  }
  return spoken
}

export function annotationsAt(cues: Cue[], word: number | null): number[] {
  if (word === null) return []
  const shown = cues.filter((cue) => word >= cue.word && (cue.untilWord === undefined || word < cue.untilWord)).map((cue) => cue.annotation)
  return [...new Set(shown)].sort((a, b) => a - b)
}

export function momentAt(narration: Narration, ms: number): Moment {
  const state = slideStateAt({ id: '', content: { kind: 'html', html: '' }, narration }, ms)
  return { word: state.word, annotations: state.shown, ended: ms >= narration.durationMs }
}

export function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

// Character offset of each word in the text, so a speech engine reporting a
// character position can be read as a word position.
export function wordOffsets(text: string): number[] {
  const offsets: number[] = []
  const pattern = /\S+/g
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) offsets.push(match.index)
  return offsets
}

export function wordAtOffset(offsets: number[], charIndex: number): number | null {
  let found: number | null = null
  for (const [index, offset] of offsets.entries()) {
    if (offset > charIndex) break
    found = index
  }
  return found
}

// Cues are written against words a person reads, so authoring names a word by
// its text and occurrence rather than counting to an index by hand.
export function wordIndex(narration: Pick<Narration, 'words'> | { text: string }, text: string, occurrence = 1): number {
  const list = 'words' in narration && narration.words.length > 0 ? narration.words.map((word) => word.text) : words('text' in narration ? narration.text : '')
  const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  let seen = 0
  for (const [index, word] of list.entries()) {
    if (normalize(word) === normalize(text) && ++seen === occurrence) return index
  }
  throw new Error(`The narration has no occurrence ${occurrence} of "${text}".`)
}
