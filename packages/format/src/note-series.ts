import { z } from 'zod'
import { REGION_NAME } from './book-section.ts'
import { closedObject } from './closed-object.ts'
import { isHebrew, NoteMarker, type NoteMarkerSource, type NoteMarker as NoteMarkerValue, type NumberSystem, noteMarkerSource } from './numbering.ts'
import { primitiveRoot } from './repeated-mark.ts'

export const NotePlacement = z.enum(['page', 'chapter', 'part', 'book'])
export type NotePlacement = z.infer<typeof NotePlacement>

export const NoteNumbering = z.enum(['chapter', 'part', 'book'])
export type NoteNumbering = z.infer<typeof NoteNumbering>

export const NoteSeries = closedObject({
  name: z.string().regex(REGION_NAME, 'a note series name must be an HTML name token'),
  key: z.enum(['counter', 'line']).default('counter'),
  lemmaSeparator: z.string().default(']'),
  placement: NotePlacement.optional(),
  numbering: NoteNumbering.optional(),
  marker: NoteMarker.optional(),
  title: z.string().optional(),
})
export type NoteSeriesInput = z.input<typeof NoteSeries>

export interface ResolvedNoteSeries {
  name: string
  key: 'counter' | 'line'
  lemmaSeparator: string
  lineNumberSystem?: NumberSystem
  placement: NotePlacement
  numbering: NoteNumbering
  marker: NoteMarkerValue
  title: string
  idStem: string
  idScope: 'chapter' | 'numbering'
  blockClass: string
  bodyClass: string
  titleClass: string
  sectionIdPrefix: string
  markerLabel: string
  markerConflictSuffixes: Readonly<Record<string, string>>
  markBlockSeries: boolean
}

type SeriesPresentation = Pick<
  ResolvedNoteSeries,
  'idStem' | 'idScope' | 'blockClass' | 'bodyClass' | 'titleClass' | 'sectionIdPrefix' | 'markerLabel' | 'markerConflictSuffixes' | 'markBlockSeries'
>

const SERIES_PRESENTATION_KEYS = [
  'idStem',
  'idScope',
  'blockClass',
  'bodyClass',
  'titleClass',
  'sectionIdPrefix',
  'markerLabel',
  'markerConflictSuffixes',
  'markBlockSeries',
] as const satisfies readonly (keyof SeriesPresentation)[]

type CompletePresentationKeys<Keys extends readonly (keyof SeriesPresentation)[]> = Exclude<keyof SeriesPresentation, Keys[number]> extends never ? Keys : never

const RESOLVED_PRESENTATION_KEYS: CompletePresentationKeys<typeof SERIES_PRESENTATION_KEYS> = SERIES_PRESENTATION_KEYS

function withoutResolvedPresentation(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !RESOLVED_PRESENTATION_KEYS.every((key) => key in value)) return value
  const authored: Record<string, unknown> = { ...value }
  for (const key of RESOLVED_PRESENTATION_KEYS) delete authored[key]
  return authored
}

export const NoteSeriesEntries = z.array(z.preprocess(withoutResolvedPresentation, NoteSeries))

type ResolvableNoteSeries = Omit<ResolvedNoteSeries, 'marker'> & { marker?: NoteMarkerValue; preferredMarker?: NoteMarkerValue }

interface NoteSeriesSettings {
  lang?: string
  lineNumberSystem?: NumberSystem
  footnotes: { marker?: NoteMarkerValue; restart: 'chapter' | 'book' }
  endnotes: { marker?: NoteMarkerValue; placement: 'book' | 'chapter'; title?: string }
  notes: NoteSeriesInput[]
}

function markerOrder(lang: string | undefined): NoteMarkerValue[] {
  return isHebrew(lang) ? ['hebrew', 'arabic', 'symbols', 'roman-lower'] : ['symbols', 'arabic', 'roman-lower', 'hebrew']
}

const ENDNOTE_PREFERRED_MARKER: NoteMarkerValue = 'arabic'

type MarkerConflict = { kind: 'same'; marker: NoteMarkerValue } | { kind: 'shared'; mark: string }

const NUMBER_CHARACTERS: Record<NumberSystem, RegExp> = {
  arabic: /^[0-9]+$/u,
  'roman-lower': /^[ivxlcdm]+$/u,
  'roman-upper': /^[IVXLCDM]+$/u,
  hebrew: /^[א-ת׳״]+$/u,
}

function commonPower(left: string, right: string): string | undefined {
  const root = primitiveRoot(left)
  if (root !== primitiveRoot(right)) return undefined
  const leftPower = left.length / root.length
  const rightPower = right.length / root.length
  const multiple = (leftPower * rightPower) / greatestCommonDivisor(leftPower, rightPower)
  return root.repeat(multiple)
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left
  let b = right
  while (b !== 0) [a, b] = [b, a % b]
  return a
}

function sourceMarks(source: ReturnType<typeof noteMarkerSource>): readonly string[] {
  return source.kind === 'fixed' ? [source.mark] : source.kind === 'sequence' ? source.entries : []
}

type NumberSource = Extract<NoteMarkerSource, { kind: 'number' }>
type SequenceSource = Extract<NoteMarkerSource, { kind: 'sequence' }>
type FixedSource = Extract<NoteMarkerSource, { kind: 'fixed' }>

function numberSymbolConflict(number: NumberSource, symbolLike: SequenceSource | FixedSource): MarkerConflict | undefined {
  const mark = sourceMarks(symbolLike).find((entry) => NUMBER_CHARACTERS[number.system].test(entry))
  return mark === undefined ? undefined : { kind: 'shared', mark }
}

function fixedSequenceConflict(fixed: FixedSource, sequence: SequenceSource): MarkerConflict | undefined {
  const entry = sequence.entries.find((candidate) => fixed.mark.startsWith(candidate) && candidate.repeat(fixed.mark.length / candidate.length) === fixed.mark)
  return entry === undefined ? undefined : { kind: 'shared', mark: fixed.mark }
}

function sequenceConflict(left: SequenceSource, right: SequenceSource, marker: NoteMarkerValue): MarkerConflict | undefined {
  if (left.entries.length === right.entries.length && left.entries.every((entry, index) => entry === right.entries[index])) {
    return { kind: 'same', marker }
  }
  for (const leftEntry of left.entries) {
    for (const rightEntry of right.entries) {
      const mark = commonPower(leftEntry, rightEntry)
      if (mark !== undefined) return { kind: 'shared', mark }
    }
  }
  return undefined
}

function markerConflictForSources(left: NoteMarkerSource, right: NoteMarkerSource, marker: NoteMarkerValue): MarkerConflict | undefined {
  switch (left.kind) {
    case 'number':
      if (right.kind === 'number') return left.system === right.system ? { kind: 'same', marker } : undefined
      return numberSymbolConflict(left, right)
    case 'fixed':
      if (right.kind === 'number') return numberSymbolConflict(right, left)
      if (right.kind === 'fixed') return left.mark === right.mark ? { kind: 'same', marker } : undefined
      return fixedSequenceConflict(left, right)
    case 'sequence':
      if (right.kind === 'number') return numberSymbolConflict(right, left)
      if (right.kind === 'fixed') return fixedSequenceConflict(right, left)
      return sequenceConflict(left, right, marker)
  }
}

function markerConflict(left: NoteMarkerValue, right: NoteMarkerValue): MarkerConflict | undefined {
  return markerConflictForSources(noteMarkerSource(left), noteMarkerSource(right), left)
}

function noteMarkerDescription(marker: NoteMarkerValue): string {
  const source = noteMarkerSource(marker)
  switch (source.kind) {
    case 'number':
      return source.system
    case 'fixed':
      return `mark ${source.mark}`
    case 'sequence':
      return `symbols ${source.entries.join(' ')}`
  }
}

function defaultMarkerOrder(preferred: NoteMarkerValue | undefined, lang: string | undefined): NoteMarkerValue[] {
  const order = markerOrder(lang)
  return preferred === undefined ? order : [preferred, ...order.filter((marker) => marker !== preferred)]
}

function unusedMarker(preferred: NoteMarkerValue | undefined, lang: string | undefined, unavailable: NoteMarkerValue[]): NoteMarkerValue {
  return defaultMarkerOrder(preferred, lang).find((marker) => unavailable.every((claimed) => markerConflict(marker, claimed) === undefined)) ?? 'symbols'
}

function resolveCustomSeries(series: NoteSeriesInput): ResolvableNoteSeries {
  if (series.placement === undefined || series.numbering === undefined) {
    throw new Error(`note series ${series.name} needs placement and numbering`)
  }
  return {
    ...series,
    placement: series.placement,
    numbering: series.numbering,
    title: series.title ?? series.name,
    idStem: `note-${series.name}`,
    idScope: 'numbering',
    blockClass: `segnavia-notes-${series.name}`,
    bodyClass: `segnavia-note-${series.name}`,
    titleClass: 'segnavia-notes-title',
    sectionIdPrefix: `segnavia-notes-${series.name}`,
    markerLabel: `note series ${series.name}`,
    markerConflictSuffixes: {},
    markBlockSeries: true,
  }
}

/** Resolves the number system printed by a line-keyed series. */
export function resolveLineKeyedNoteSystem(marker: NoteMarkerValue | undefined, lineNumberSystem: NumberSystem): NumberSystem {
  if (marker === undefined) return lineNumberSystem
  const source = noteMarkerSource(marker)
  if (source.kind !== 'number') {
    throw new RangeError('a line-keyed note series marker must be a number system; use arabic, roman-lower, roman-upper or hebrew to clear this refusal')
  }
  return source.system
}

export function resolveNoteSeries(settings: NoteSeriesSettings): ResolvedNoteSeries[] {
  const hebrew = isHebrew(settings.lang)
  const declared = new Map(settings.notes.map((series) => [series.name, series]))
  const footnotePresentation: SeriesPresentation = {
    idStem: 'fn',
    idScope: 'chapter',
    blockClass: 'segnavia-footnotes',
    bodyClass: 'segnavia-footnote',
    titleClass: 'segnavia-notes-title',
    sectionIdPrefix: 'segnavia-notes-footnote',
    markerLabel: 'footnote',
    markerConflictSuffixes: { endnote: 'the two must differ when both kinds are used' },
    markBlockSeries: false,
  }
  const endnotePresentation: SeriesPresentation = {
    idStem: 'en',
    idScope: 'numbering',
    blockClass: 'segnavia-notes-endnote',
    bodyClass: 'segnavia-endnote',
    titleClass: 'segnavia-endnotes-title',
    sectionIdPrefix: 'segnavia-endnotes',
    markerLabel: 'endnote',
    markerConflictSuffixes: {},
    markBlockSeries: true,
  }
  const footnote: ResolvableNoteSeries = {
    name: 'footnote',
    placement: 'page',
    numbering: settings.footnotes.restart,
    marker: settings.footnotes.marker,
    preferredMarker: markerOrder(settings.lang)[0],
    title: hebrew ? 'מקורות' : 'Footnotes',
    ...footnotePresentation,
    ...declared.get('footnote'),
  }
  const endnote: ResolvableNoteSeries = {
    name: 'endnote',
    placement: settings.endnotes.placement,
    numbering: 'book',
    marker: settings.endnotes.marker,
    preferredMarker: ENDNOTE_PREFERRED_MARKER,
    title: settings.endnotes.title ?? (hebrew ? 'הערות' : 'Notes'),
    ...endnotePresentation,
    ...declared.get('endnote'),
  }
  const inputs: ResolvableNoteSeries[] = [
    footnote,
    endnote,
    ...settings.notes.filter(({ name }) => name !== 'footnote' && name !== 'endnote').map(resolveCustomSeries),
  ]
  const explicitMarkers = inputs.flatMap(({ marker }) => (marker === undefined ? [] : [marker]))
  const used: NoteMarkerValue[] = []
  return inputs.map((series) => {
    const key = series.key ?? 'counter'
    const lineNumberSystem =
      key === 'line' && settings.lineNumberSystem !== undefined
        ? resolveLineKeyedNoteSystem(series.marker, settings.lineNumberSystem)
        : undefined
    const marker = series.marker ?? unusedMarker(series.preferredMarker, settings.lang, [...used, ...explicitMarkers])
    used.push(marker)
    return {
      name: series.name,
      key,
      lemmaSeparator: series.lemmaSeparator ?? ']',
      ...(lineNumberSystem === undefined ? {} : { lineNumberSystem }),
      placement: series.placement,
      numbering: series.numbering,
      marker,
      title: series.title,
      idStem: series.idStem,
      idScope: series.idScope,
      blockClass: series.blockClass,
      bodyClass: series.bodyClass,
      titleClass: series.titleClass,
      sectionIdPrefix: series.sectionIdPrefix,
      markerLabel: series.markerLabel,
      markerConflictSuffixes: series.markerConflictSuffixes,
      markBlockSeries: series.markBlockSeries,
    }
  })
}

export function noteSeriesIssues(series: ResolvedNoteSeries[], mode: 'continuous' | 'paginated'): Array<{ path: (string | number)[]; message: string }> {
  const issues: Array<{ path: (string | number)[]; message: string }> = []
  series.forEach((item, index) => {
    if (mode === 'continuous' && (item.placement === 'chapter' || item.placement === 'part')) {
      issues.push({
        path: ['notes', index, 'placement'],
        message: `note series ${item.name} uses ${item.placement} placement only available in paginated mode; use page or book placement, or paginated mode`,
      })
    }
  })
  return issues
}

export function noteMarkerIssues(series: ResolvedNoteSeries[], used: ReadonlySet<string>): string[] {
  const active = series.filter(({ name, key }) => key === 'counter' && used.has(name))
  const issues: string[] = []
  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      const a = active[left]
      const b = active[right]
      if (!a || !b) continue
      const conflict = markerConflict(a.marker, b.marker)
      if (conflict === undefined) continue
      const suffix = a.markerConflictSuffixes[b.name] ?? b.markerConflictSuffixes[a.name] ?? 'used series must have different markers'
      const leftDescription = noteMarkerDescription(a.marker)
      const rightDescription = noteMarkerDescription(b.marker)
      const description =
        conflict.kind === 'same'
          ? `are both ${noteMarkerDescription(conflict.marker)}`
          : `${leftDescription} and ${rightDescription} share mark ${conflict.mark}`
      issues.push(`${a.markerLabel} and ${b.markerLabel} markers ${description}; ${suffix}`)
    }
  }
  return issues
}
