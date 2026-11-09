import { z } from 'zod'
import { Direction, TextDirection } from './direction.ts'
import { Box, MeasuredSize, PixelSize, Point } from './geometry.ts'
import { ImageFit } from './image-fit.ts'
import { type LimitExceeded, type Limits, limitExceeded } from './limits.ts'
import { PX_PER_MM } from './paper.ts'
import { Placement, PlacementShape } from './placement.ts'
import { PressGeometry } from './print.ts'
import { Scripts } from './scripts.ts'
import { Slots } from './slots.ts'
import { Brand, StyleSheet } from './style-sheet.ts'
import { SlideTiming, slideTimingIssues } from './timing.ts'
import { Transition } from './transition.ts'

export { Box, ImageFit, MeasuredSize, PixelSize, Point }

// One annotation as measured on its element at capture time, in the shot's
// CSS pixels. It belongs to the image it was measured on: a recapture that
// moves the element moves the annotation with it.
export const Annotation = z.object({
  ring: Box.nullable(),
  badge: z.object({ center: Point, number: z.number().int() }).nullable(),
  arrow: z.object({ head: Point, tail: Point, label: z.string().nullable() }).nullable(),
})
export type Annotation = z.infer<typeof Annotation>

export const SHOT_KEY = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/

export const Shot = z.object({
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
export const PublishedShot = z.object({ src: z.string(), shot: Shot })
export type PublishedShot = z.infer<typeof PublishedShot>

export const Word = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
})
export type Word = z.infer<typeof Word>

// A cue shows an annotation from the moment its word is spoken until the
// slide ends, or until the word named by `untilWord`.
export const Cue = z.object({
  word: z.number().int().nonnegative(),
  annotation: z.number().int().nonnegative(),
  untilWord: z.number().int().nonnegative().optional(),
})
export type Cue = z.infer<typeof Cue>

// `words` empty with `live` set means the viewer speaks the text itself and
// learns the timings as it goes; cues still name words by position.
export const Narration = z.object({
  text: z.string(),
  // The language spoken, for the voice and the caption; dir defaults from it.
  lang: z.string().optional(),
  dir: Direction.optional(),
  voice: z.string().optional(),
  words: z.array(Word),
  durationMs: z.number().nonnegative(),
  audio: z.string().nullable(),
  live: z.boolean().default(false),
  cues: z.array(Cue).default([]),
})
export type Narration = z.infer<typeof Narration>

const DirectSlideContent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('html'), html: z.string() }),
  // HTML the host serves itself, under its own headers: a single-use ticket,
  // a CSP, a URL that expires.
  z.object({ kind: z.literal('url'), src: z.string() }),
  z.object({ kind: z.literal('shot'), src: z.string(), shot: Shot, fit: ImageFit.optional(), frame: z.boolean().optional() }),
  // A shot named by its permanent address, resolved when the deck is shown,
  // so a recapture reaches every deck that names it.
  z.object({ kind: z.literal('shot-ref'), href: z.string(), fit: ImageFit.optional(), frame: z.boolean().optional() }),
  z.object({ kind: z.literal('image'), src: z.string(), alt: z.string(), fit: ImageFit.optional(), frame: z.boolean().optional() }),
])
export const SlideContent = z.union([DirectSlideContent, z.object({ media: PlacementShape })])
export type SlideContent = z.infer<typeof SlideContent>

// A slide plays for its narration and surrounding pauses, or for its hold.
export const Slide = z.object({
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

export const DeckShape = z.object({
  brand: Brand.optional(),
  title: z.string(),
  size: PixelSize.default(DECK_SIZE),
  layout: z.enum(['fixed', 'responsive']).default('fixed'),
  fit: ImageFit.default('contain'),
  frame: z.boolean().default(false),
  scripts: Scripts.default('refuse'),
  dir: Direction.optional(),
  lang: z.string().optional(),
  transition: Transition.optional(),
  playback: Playback.optional(),
  captions: z.enum(['on', 'off', 'viewer']).optional(),
  slots: Slots.optional(),
  style: StyleSheet.optional(),
  print: PressGeometry.optional(),
  slides: z.array(Slide).min(1),
})

export function annotationCueIssues(narration: Slide['narration'], annotations: number): string[] {
  if (!narration) return []
  return narration.cues
    .filter((cue) => cue.annotation >= annotations)
    .map((cue) => `a cue names annotation ${cue.annotation}, but the slide has ${annotations}`)
}

function cueIssues(slide: Slide): string[] {
  const narration = slide.narration
  if (!narration) return []
  // A shot named by reference has its annotations only once resolved, and a
  // live narration learns its words while it speaks, so neither is checked here.
  const annotations = 'kind' in slide.content && slide.content.kind === 'shot' ? slide.content.shot.annotations.length : null
  const words = narration.live ? null : narration.words.length
  const issues: string[] = []
  for (const cue of narration.cues) {
    for (const word of [cue.word, cue.untilWord]) {
      if (word !== undefined && words !== null && word >= words) issues.push(`a cue names word ${word}, but the narration has ${words} words`)
    }
    if (!('kind' in slide.content) || (slide.content.kind !== 'shot' && slide.content.kind !== 'shot-ref'))
      issues.push('a cue names an annotation, but only a shot carries annotations')
  }
  if (annotations !== null) issues.push(...annotationCueIssues(narration, annotations))
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
    for (const message of cueIssues(slide)) ctx.addIssue({ code: 'custom', path: ['slides', index, 'narration', 'cues'], message })
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

export const Manifest = z.object({
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
