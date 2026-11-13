import { z } from 'zod'
import { AsOf } from './as-of.ts'
import { closedObject } from './closed-object.ts'
import { Direction, TextDirection } from './direction.ts'
import { Box, MeasuredSize, PixelSize, Point } from './geometry.ts'
import { ImageFit } from './image-fit.ts'
import { type LimitExceeded, type Limits, limitExceeded } from './limits.ts'
import { type NarrationPacing, narrationTiming } from './narration-timing.ts'
import { PX_PER_MM } from './paper.ts'
import { Placement, PlacementShape } from './placement.ts'
import { PressGeometry } from './print.ts'
import { Scripts } from './scripts.ts'
import { Slots } from './slots.ts'
import { Brand, StyleSheet } from './style-sheet.ts'
import { MAX_SLIDE_TIMING_MS, SlideTiming, slideTimingIssues } from './timing.ts'
import { Transition } from './transition.ts'

export { Box, ImageFit, MeasuredSize, PixelSize, Point }

// One annotation as measured on its element at capture time, in the shot's
// CSS pixels. It belongs to the image it was measured on: a recapture that
// moves the element moves the annotation with it.
export const Annotation = closedObject({
  ring: Box.nullable(),
  badge: closedObject({ center: Point, number: z.number().int() }).nullable(),
  arrow: closedObject({ head: Point, tail: Point, label: z.string().nullable() }).nullable(),
})
export type Annotation = z.infer<typeof Annotation>

export const SHOT_KEY = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/

export const Shot = closedObject({
  key: z.string().regex(SHOT_KEY),
  title: z.string(),
  description: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  file: z.string(),
  // The annotated rendition, when the capture asked for one: the same image
  // with every annotation drawn in, for a page that embeds a still picture.
  annotatedFile: z.string().nullable().default(null),
  size: PixelSize,
  scale: z.number().positive(),
  // The captured app's own direction, which places badges on its inline-end side.
  dir: TextDirection.default('ltr'),
  annotations: z.array(Annotation),
  capturedAt: z.string(),
  meta: z.record(z.string(), z.unknown()).default({}),
})
export type Shot = z.infer<typeof Shot>

// What a host serves at a shot's address: the image of one version and the
// geometry measured on that same image, so the two can never disagree.
export const PublishedShot = closedObject({ src: z.string(), shot: Shot })
export type PublishedShot = z.infer<typeof PublishedShot>

export const Word = closedObject({
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
})
export type Word = z.infer<typeof Word>

// A cue shows an annotation from the moment its word is spoken until the
// slide ends, or until the word named by `untilWord`.
export const Cue = closedObject({
  word: z.number().int().nonnegative(),
  annotation: z.number().int().nonnegative(),
  untilWord: z.number().int().nonnegative().optional(),
})
export type Cue = z.infer<typeof Cue>

const SharedNarration = {
  text: z.string(),
  lang: z.string().optional(),
  dir: Direction.optional(),
  cues: z.array(Cue).default([]),
}

const TextNarration = closedObject({
  kind: z.literal('text'),
  ...SharedNarration,
})
export type TextNarration = z.infer<typeof TextNarration>

// `words` empty with `live` set means the viewer speaks the text itself and
// learns the timings as it goes; cues still name words by position.
const VoicedNarration = closedObject({
  kind: z.literal('voiced').optional(),
  ...SharedNarration,
  // The language spoken, for the voice and the caption; dir defaults from it.
  voice: z.string().optional(),
  words: z.array(Word),
  durationMs: z.number().nonnegative(),
  audio: z.string().nullable(),
  live: z.boolean().default(false),
})
export type VoicedNarration = z.infer<typeof VoicedNarration>

const VOICED_ONLY_KEYS = Object.keys(VoicedNarration.shape).filter((key) => !(key in TextNarration.shape))

function issueMessage(issue: z.core.$ZodIssue): string {
  const path = issue.path?.map(String).join('.')
  if (issue.code === 'invalid_type' && path) return `${path}: expected ${issue.expected}; supply ${path} as ${issue.expected} to clear this refusal`
  return path ? `${path}: ${issue.message}` : issue.message
}

function schemaMessage(schema: typeof TextNarration | typeof VoicedNarration, input: unknown, preferredKeys: readonly string[] = []): string {
  const result = schema.safeParse(input)
  if (result.success) return 'the narration does not match its kind; correct its fields to clear this refusal'
  const preferred = result.error.issues.find((issue) => issue.code === 'unrecognized_keys' && issue.keys.some((key) => preferredKeys.includes(key)))
  return issueMessage(preferred ?? (result.error.issues[0] as z.core.$ZodIssue))
}

function narrationUnionMessage(input: unknown): string {
  const value = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : null
  if (value?.kind === 'text') return schemaMessage(TextNarration, input, VOICED_ONLY_KEYS)
  const result = VoicedNarration.safeParse(input)
  if (!result.success && value) {
    const missing = result.error.issues
      .filter((issue) => issue.code === 'invalid_type' && issue.input === undefined && issue.path.length === 1)
      .map((issue) => String(issue.path[0]))
    if (missing.length > 0) {
      const alternative = value.kind === undefined ? ", or set kind: 'text' and supply text" : ''
      return `a voiced narration requires ${missing.join(', ')}; supply ${missing.join(', ')}${alternative} to clear this refusal`
    }
  }
  return schemaMessage(VoicedNarration, input)
}

export const Narration = z.union([TextNarration, VoicedNarration], { error: (issue) => narrationUnionMessage(issue.input) })
export type Narration = z.infer<typeof Narration>

const DirectSlideContent = z.discriminatedUnion('kind', [
  closedObject({ kind: z.literal('html'), html: z.string() }),
  // HTML the host serves itself, under its own headers: a single-use ticket,
  // a CSP, a URL that expires.
  closedObject({ kind: z.literal('url'), src: z.string() }),
  closedObject({ kind: z.literal('shot'), src: z.string(), shot: Shot, fit: ImageFit.optional(), frame: z.boolean().optional() }),
  // A shot named by its permanent address, resolved when the deck is shown,
  // so a recapture reaches every deck that names it.
  closedObject({ kind: z.literal('shot-ref'), href: z.string(), fit: ImageFit.optional(), frame: z.boolean().optional() }),
  closedObject({ kind: z.literal('image'), src: z.string(), alt: z.string(), fit: ImageFit.optional(), frame: z.boolean().optional() }),
])
export const SlideContent = z.union([DirectSlideContent, closedObject({ media: PlacementShape })])
export type SlideContent = z.infer<typeof SlideContent>

// A slide plays for its narration and surrounding pauses, or for its hold.
export const Slide = closedObject({
  id: z.string(),
  content: SlideContent,
  notes: z.string().optional(),
  narration: Narration.optional(),
  beforeMs: SlideTiming.optional(),
  afterMs: SlideTiming.optional(),
  holdMs: SlideTiming.optional(),
  printAtMs: z.number().nonnegative().optional(),
})
export type Slide = z.infer<typeof Slide>

export const DECK_SIZE = { width: 1280, height: 720 } as const

export function deckTrim(size: { width: number; height: number } = DECK_SIZE): { width: number; height: number } {
  return { width: size.width / PX_PER_MM, height: size.height / PX_PER_MM }
}

// How the track draws progress while the deck plays through: one segment per
// slide, or one continuous seek bar. `step`, its earlier name, still parses.
export const PLAYBACK_MODES = ['segmented', 'continuous'] as const
export type PlaybackMode = (typeof PLAYBACK_MODES)[number]
export const Playback = z.union([z.enum(PLAYBACK_MODES), z.literal('step').transform((): PlaybackMode => 'segmented')])

// A playback value from outside a parsed deck (an attribute, a host option), or undefined.
export function parsePlayback(value: unknown): PlaybackMode | undefined {
  const parsed = Playback.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export const DeckShape = closedObject({
  brand: Brand.optional(),
  title: z.string(),
  size: PixelSize.default(DECK_SIZE),
  layout: z.enum(['fixed', 'responsive']).default('fixed'),
  fit: ImageFit.default('contain'),
  frame: z.boolean().default(false),
  readingSpeed: z.number().finite().positive().optional(),
  scripts: Scripts.default('refuse'),
  dir: Direction.optional(),
  lang: z.string().optional(),
  transition: Transition.optional(),
  playback: Playback.optional(),
  captions: z.enum(['on', 'off', 'viewer']).optional(),
  slots: Slots.optional(),
  style: StyleSheet.optional(),
  asOf: AsOf.optional(),
  print: PressGeometry.optional(),
  slides: z.array(Slide).min(1),
})

export function annotationCueIssues(narration: Slide['narration'], annotations: number): string[] {
  if (!narration) return []
  return narration.cues
    .filter((cue) => cue.annotation >= annotations)
    .map((cue) => `a cue names annotation ${cue.annotation}, but the slide has ${annotations}`)
}

interface NarrationIssue {
  field?: 'cues'
  message: string
}

function textDurationIssue(narration: Narration, deck: NarrationPacing, durationMs: number | undefined): NarrationIssue | null {
  if (narration.kind !== 'text' || durationMs === undefined) return null
  if (deck.readingSpeed !== undefined && (!Number.isFinite(deck.readingSpeed) || deck.readingSpeed <= 0)) return null
  if (durationMs <= MAX_SLIDE_TIMING_MS) return null
  return {
    message: `the text narration computes to ${durationMs} ms, above the ${MAX_SLIDE_TIMING_MS} ms cap; shorten the text or raise readingSpeed to clear this refusal`,
  }
}

function narrationIssues(slide: Slide, deck: NarrationPacing): NarrationIssue[] {
  const narration = slide.narration
  if (!narration) return []
  // A shot named by reference has its annotations only once resolved, and a
  // live narration learns its words while it speaks, so neither is checked here.
  const annotations = 'kind' in slide.content && slide.content.kind === 'shot' ? slide.content.shot.annotations.length : null
  const timing = narration.kind !== 'text' && narration.live ? null : narrationTiming(narration, deck)
  const words = timing?.words.length ?? null
  const issues: NarrationIssue[] = []
  for (const cue of narration.cues) {
    for (const word of [cue.word, cue.untilWord]) {
      if (word !== undefined && words !== null && word >= words)
        issues.push({ field: 'cues', message: `a cue names word ${word}, but the narration has ${words} words` })
    }
    if (!('kind' in slide.content) || (slide.content.kind !== 'shot' && slide.content.kind !== 'shot-ref'))
      issues.push({ field: 'cues', message: 'a cue names an annotation, but only a shot carries annotations' })
  }
  if (annotations !== null) issues.push(...annotationCueIssues(narration, annotations).map((message) => ({ field: 'cues' as const, message })))
  const durationIssue = textDurationIssue(narration, deck, timing?.durationMs)
  if (durationIssue) issues.push(durationIssue)
  return issues
}

export const Deck = DeckShape.superRefine((deck, ctx) => {
  deck.slides.forEach((slide, index) => {
    if ('media' in slide.content) {
      try {
        Placement.parse(slide.content.media, 'deck')
      } catch (error) {
        ctx.addIssue({ code: 'custom', path: ['slides', index, 'content', 'media'], message: error instanceof Error ? error.message : String(error) })
      }
    }
    for (const issue of narrationIssues(slide, deck))
      ctx.addIssue({ code: 'custom', path: ['slides', index, 'narration', ...(issue.field === undefined ? [] : [issue.field])], message: issue.message })
    for (const field of slideTimingIssues(slide)) {
      const kind = field === 'holdMs' ? 'without' : 'with'
      ctx.addIssue({ code: 'custom', path: ['slides', index, field], message: `${field} is allowed only ${kind} narration` })
    }
  })
  const ids = new Set<string>()
  deck.slides.forEach((slide, index) => {
    if (ids.has(slide.id)) ctx.addIssue({ code: 'custom', path: ['slides', index, 'id'], message: `slide id "${slide.id}" is used twice` })
    ids.add(slide.id)
  })
})
export type Deck = z.infer<typeof Deck>

export const Manifest = closedObject({
  shots: z.record(z.string(), Shot),
  updatedAt: z.string(),
})
export type Manifest = z.infer<typeof Manifest>

// A host's own ceilings, checked where it accepts a deck. Returns structured
// refusals with each exceeded measure and its sentence; an empty list means it fits.
export function deckLimitsExceeded(deck: Deck, limits: Limits): LimitExceeded[] {
  const exceeded: LimitExceeded[] = []
  const bytes = (text: string) => new TextEncoder().encode(text).length
  if (limits.slides !== undefined && deck.slides.length > limits.slides) {
    exceeded.push(limitExceeded('slides', deck.slides.length, limits.slides))
  }
  deck.slides.forEach((slide, index) => {
    if (limits.slideBytes !== undefined && 'kind' in slide.content && slide.content.kind === 'html' && bytes(slide.content.html) > limits.slideBytes) {
      const actual = bytes(slide.content.html)
      const where = `slide ${index + 1}`
      exceeded.push(limitExceeded('slideBytes', actual, limits.slideBytes, { where }))
    }
    if (limits.notesBytes !== undefined && slide.notes && bytes(slide.notes) > limits.notesBytes) {
      const actual = bytes(slide.notes)
      const where = `slide ${index + 1}`
      exceeded.push(limitExceeded('notesBytes', actual, limits.notesBytes, { where }))
    }
  })
  return exceeded
}

export function exceedsLimits(deck: Deck, limits: Limits): string[] {
  return deckLimitsExceeded(deck, limits).map(({ message }) => message)
}
