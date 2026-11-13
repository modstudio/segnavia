// What a playing slide shows at a moment: the word being spoken and the
// annotations whose cues have arrived. Pure, so the viewer, a test and a
// future video export all read the same answer from the same narration.

import { type Cue, type Deck, type Narration, narrationTiming, type Slide } from '@segnavia/format'

type TimingDeck = Pick<Deck, 'readingSpeed'>

export interface Moment {
  word: number | null
  annotations: number[] | null
  ended: boolean
}

export type SlidePhase = 'before' | 'narration' | 'after' | 'hold' | 'untimed'

export interface SlideMoment {
  word: number | null
  shown: number[] | null
  phase: SlidePhase
}

export interface PhaseBounds {
  beforeMs: number
  narrationEndMs: number
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

export function slideDurationMs(slide: Slide, deck: TimingDeck = {}): number | null {
  if (slide.narration) return (slide.beforeMs ?? 0) + narrationTiming(slide.narration, deck).durationMs + (slide.afterMs ?? 0)
  return slide.holdMs ?? null
}

export function phaseBounds(slide: Pick<Slide, 'beforeMs' | 'narration'>, deck: TimingDeck = {}): PhaseBounds {
  const beforeMs = slide.beforeMs ?? 0
  return { beforeMs, narrationEndMs: beforeMs + (slide.narration ? narrationTiming(slide.narration, deck).durationMs : 0) }
}

export function deckTimeline(deck: Pick<Deck, 'slides' | 'readingSpeed'>): DeckTimeline {
  let totalMs = 0
  const slides = deck.slides.map((slide) => {
    const durationMs = slideDurationMs(slide, deck)
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

export function slideStateAt(slide: Slide, ms: number, deck: TimingDeck = {}): SlideMoment {
  const position = Math.max(0, ms)
  if (!slide.narration) return { word: null, shown: null, phase: slide.holdMs === undefined ? 'untimed' : 'hold' }
  const timing = narrationTiming(slide.narration, deck)
  const { beforeMs } = phaseBounds(slide, deck)
  if (position < beforeMs) return { word: null, shown: [], phase: 'before' }
  const narrationMs = position - beforeMs
  if (narrationMs < timing.durationMs) {
    const word = wordAt(timing, narrationMs)
    return { word, shown: annotationsAt(slide.narration.cues, word), phase: 'narration' }
  }
  const word = wordAt(timing, timing.durationMs)
  return { word, shown: annotationsAt(slide.narration.cues, word), phase: 'after' }
}

// The word whose span holds the time, or during a pause the word just spoken,
// so the caption never blinks off between words.
export function wordAt(narration: { words: NarrationTimingWords }, ms: number): number | null {
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

type NarrationTimingWords = ReturnType<typeof narrationTiming>['words']

export function momentAt(narration: Narration, ms: number, deck: TimingDeck = {}): Moment {
  const timing = narrationTiming(narration, deck)
  const state = slideStateAt({ id: '', content: { kind: 'html', html: '' }, narration }, ms, deck)
  return { word: state.word, annotations: state.shown, ended: ms >= timing.durationMs }
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
export function wordIndex(narration: { words: NarrationTimingWords } | { text: string; words?: NarrationTimingWords }, text: string, occurrence = 1): number {
  const list =
    'words' in narration && narration.words && narration.words.length > 0
      ? narration.words.map((word) => word.text)
      : words('text' in narration ? narration.text : '')
  const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  let seen = 0
  for (const [index, word] of list.entries()) {
    if (normalize(word) === normalize(text) && ++seen === occurrence) return index
  }
  throw new Error(`The narration has no occurrence ${occurrence} of "${text}".`)
}
