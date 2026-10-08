// The shapes every package agrees on. Hosts read and write these as JSON, so
// each is a Zod schema and the JSON Schema is generated from it (`jsonSchemas`)
// for hosts that do not run TypeScript.

import { z } from 'zod'

export { firstStrongDirection, languageDirection, resolveDirection, type TextDirection } from './direction.ts'

export const Size = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
export type Size = z.infer<typeof Size>

// What an author's own scripts may do. `refuse` never runs them; `sandboxed`
// runs them in a frame with an opaque origin that cannot reach its host.
export const Scripts = z.enum(['refuse', 'sandboxed'])
export type Scripts = z.infer<typeof Scripts>

export const Direction = z.enum(['ltr', 'rtl', 'auto'])

export const NAMED_PAPERS = ['letter', 'legal', 'tabloid', 'a3', 'a4', 'a5'] as const
export const Paper = z.union([z.enum(NAMED_PAPERS), z.object({ width: z.number().positive(), height: z.number().positive(), unit: z.enum(['mm', 'in']) })])
export type Paper = z.infer<typeof Paper>

export const Margin = z.object({
  top: z.number().nonnegative().default(0),
  right: z.number().nonnegative().default(0),
  bottom: z.number().nonnegative().default(0),
  left: z.number().nonnegative().default(0),
})

// Paper exists only to export a page at a standard printed size. A page
// without it exports at its own size. Margins are in millimetres.
export const Print = z.object({
  paper: Paper,
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  margin: Margin.optional(),
})
export type Print = z.infer<typeof Print>

// A page is designed for the screen at whatever size it needs: fluid (the
// viewer's width, as tall as its content), a fixed sheet, or a fixed width
// that grows with its content.
export const PageSize = z.union([z.literal('fluid'), Size, z.object({ width: z.number().int().positive(), height: z.literal('auto') })])
export type PageSize = z.infer<typeof PageSize>

export const Page = z.object({
  html: z.string(),
  size: PageSize.default('fluid'),
  scripts: Scripts.default('refuse'),
  dir: Direction.optional(),
  lang: z.string().optional(),
  print: Print.optional(),
})
export type Page = z.infer<typeof Page>
export type PageInput = z.input<typeof Page>

export const Box = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
export type Box = z.infer<typeof Box>

export const Point = z.object({ x: z.number(), y: z.number() })

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
  size: Size,
  scale: z.number().positive(),
  // The captured app's own direction, which places badges on its inline-end side.
  dir: z.enum(['ltr', 'rtl']).default('ltr'),
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

export const SlideContent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('html'), html: z.string() }),
  // HTML the host serves itself, under its own headers: a single-use ticket,
  // a CSP, a URL that expires.
  z.object({ kind: z.literal('url'), src: z.string() }),
  z.object({ kind: z.literal('shot'), src: z.string(), shot: Shot }),
  // A shot named by its permanent address, resolved when the deck is shown,
  // so a recapture reaches every deck that names it.
  z.object({ kind: z.literal('shot-ref'), href: z.string() }),
  z.object({ kind: z.literal('image'), src: z.string(), alt: z.string() }),
])
export type SlideContent = z.infer<typeof SlideContent>

// A slide plays when it has narration and is static when it has none.
export const Slide = z.object({
  id: z.string(),
  content: SlideContent,
  notes: z.string().optional(),
  narration: Narration.optional(),
})
export type Slide = z.infer<typeof Slide>

export const DECK_SIZE = { width: 1280, height: 720 } as const

const DeckShape = z.object({
  title: z.string(),
  size: Size.default(DECK_SIZE),
  scripts: Scripts.default('refuse'),
  dir: Direction.optional(),
  lang: z.string().optional(),
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
  const annotations = slide.content.kind === 'shot' ? slide.content.shot.annotations.length : null
  const words = narration.live ? null : narration.words.length
  const issues: string[] = []
  for (const cue of narration.cues) {
    for (const word of [cue.word, cue.untilWord]) {
      if (word !== undefined && words !== null && word >= words) issues.push(`a cue names word ${word}, but the narration has ${words} words`)
    }
    if (slide.content.kind !== 'shot' && slide.content.kind !== 'shot-ref') issues.push('a cue names an annotation, but only a shot carries annotations')
  }
  if (annotations !== null) issues.push(...annotationCueIssues(narration, annotations))
  return issues
}

export const Deck = DeckShape.superRefine((deck, ctx) => {
  deck.slides.forEach((slide, index) => {
    for (const message of cueIssues(slide)) ctx.addIssue({ code: 'custom', path: ['slides', index, 'narration', 'cues'], message })
  })
  const ids = new Set<string>()
  deck.slides.forEach((slide, index) => {
    if (ids.has(slide.id)) ctx.addIssue({ code: 'custom', path: ['slides', index, 'id'], message: `slide id "${slide.id}" is used twice` })
    ids.add(slide.id)
  })
})
export type Deck = z.infer<typeof Deck>
export type DeckInput = z.input<typeof Deck>

export const Manifest = z.object({
  shots: z.record(z.string(), Shot),
  updatedAt: z.string(),
})
export type Manifest = z.infer<typeof Manifest>

export interface DeckLimits {
  maxSlides?: number
  maxSlideBytes?: number
  maxNotesBytes?: number
}

// A host's own ceilings, checked where it accepts a deck. Returns the reasons
// a deck exceeds them; an empty list means it fits.
export function exceedsLimits(deck: Deck, limits: DeckLimits): string[] {
  const reasons: string[] = []
  const bytes = (text: string) => new TextEncoder().encode(text).length
  if (limits.maxSlides !== undefined && deck.slides.length > limits.maxSlides) {
    reasons.push(`the deck has ${deck.slides.length} slides; the limit is ${limits.maxSlides}`)
  }
  deck.slides.forEach((slide, index) => {
    if (limits.maxSlideBytes !== undefined && slide.content.kind === 'html' && bytes(slide.content.html) > limits.maxSlideBytes) {
      reasons.push(`slide ${index + 1} is ${bytes(slide.content.html)} bytes; the limit is ${limits.maxSlideBytes}`)
    }
    if (limits.maxNotesBytes !== undefined && slide.notes && bytes(slide.notes) > limits.maxNotesBytes) {
      reasons.push(`slide ${index + 1} has ${bytes(slide.notes)} bytes of notes; the limit is ${limits.maxNotesBytes}`)
    }
  })
  return reasons
}

// Every shot a deck shows, so a host can record where each one is used and
// say which decks a recapture reaches.
export interface ShotUse {
  slide: string
  key?: string
  href?: string
}

export function shotsUsed(deck: Deck): ShotUse[] {
  return deck.slides.flatMap((slide): ShotUse[] => {
    if (slide.content.kind === 'shot') return [{ slide: slide.id, key: slide.content.shot.key }]
    if (slide.content.kind === 'shot-ref') return [{ slide: slide.id, href: slide.content.href }]
    return []
  })
}

export function jsonSchemas() {
  return {
    page: z.toJSONSchema(Page, { io: 'input' }),
    deck: z.toJSONSchema(DeckShape, { io: 'input' }),
    manifest: z.toJSONSchema(Manifest, { io: 'input' }),
    publishedShot: z.toJSONSchema(PublishedShot, { io: 'input' }),
  }
}

// Millimetres per named paper, portrait.
export const PAPER_MM: Record<(typeof NAMED_PAPERS)[number], { width: number; height: number }> = {
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
  tabloid: { width: 279.4, height: 431.8 },
  a3: { width: 297, height: 420 },
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
}

// The sheet a print setting describes, in millimetres, with orientation applied.
export function sheetMm(print: Print): { width: number; height: number } {
  const portrait =
    typeof print.paper === 'string'
      ? PAPER_MM[print.paper]
      : print.paper.unit === 'in'
        ? { width: print.paper.width * 25.4, height: print.paper.height * 25.4 }
        : { width: print.paper.width, height: print.paper.height }
  const [short, long] = [Math.min(portrait.width, portrait.height), Math.max(portrait.width, portrait.height)]
  const round = (mm: number) => Math.round(mm * 100) / 100
  return print.orientation === 'landscape' ? { width: round(long), height: round(short) } : { width: round(short), height: round(long) }
}

// CSS pixels per millimetre at the 96 dpi every browser lays out at.
export const PX_PER_MM = 96 / 25.4
