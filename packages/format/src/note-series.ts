import { z } from 'zod'
import { REGION_NAME } from './book-section.ts'
import { isHebrew, NoteMarker, type NoteMarker as NoteMarkerValue, noteMarkerDescription, noteMarkerEntries } from './numbering.ts'

export const NotePlacement = z.enum(['page', 'chapter', 'part', 'book'])
export type NotePlacement = z.infer<typeof NotePlacement>

export const NoteNumbering = z.enum(['chapter', 'part', 'book'])
export type NoteNumbering = z.infer<typeof NoteNumbering>

export const NoteSeries = z.object({
  name: z.string().regex(REGION_NAME, 'a note series name must be an HTML name token'),
  placement: NotePlacement.optional(),
  numbering: NoteNumbering.optional(),
  marker: NoteMarker.optional(),
  title: z.string().optional(),
})
export type NoteSeriesInput = z.input<typeof NoteSeries>

export interface ResolvedNoteSeries {
  name: string
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

type ResolvableNoteSeries = Omit<ResolvedNoteSeries, 'marker'> & { marker?: NoteMarkerValue; preferredMarker?: NoteMarkerValue }

interface NoteSeriesSettings {
  lang?: string
  footnotes: { marker?: NoteMarkerValue; restart: 'chapter' | 'book' }
  endnotes: { marker?: NoteMarkerValue; placement: 'book' | 'chapter'; title?: string }
  notes: NoteSeriesInput[]
}

function markerOrder(lang: string | undefined): NoteMarkerValue[] {
  return isHebrew(lang) ? ['hebrew', 'arabic', 'symbols', 'roman-lower'] : ['symbols', 'arabic', 'roman-lower', 'hebrew']
}

function sharedMarkerEntry(left: NoteMarkerValue, right: NoteMarkerValue): string | undefined {
  const leftEntries = noteMarkerEntries(left)
  const rightEntries = noteMarkerEntries(right)
  if (leftEntries && rightEntries) return leftEntries.find((entry) => rightEntries.includes(entry))
  if (!leftEntries && !rightEntries && left === right) return left as string
  return undefined
}

function defaultMarkerOrder(preferred: NoteMarkerValue | undefined, lang: string | undefined): NoteMarkerValue[] {
  const order = markerOrder(lang)
  return preferred === undefined ? order : [preferred, ...order.filter((marker) => marker !== preferred)]
}

function unusedMarker(preferred: NoteMarkerValue | undefined, lang: string | undefined, unavailable: NoteMarkerValue[]): NoteMarkerValue {
  return defaultMarkerOrder(preferred, lang).find((marker) => unavailable.every((claimed) => sharedMarkerEntry(marker, claimed) === undefined)) ?? 'symbols'
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
    preferredMarker: hebrew ? 'hebrew' : 'symbols',
    title: hebrew ? 'מקורות' : 'Footnotes',
    ...footnotePresentation,
    ...declared.get('footnote'),
  }
  const endnote: ResolvableNoteSeries = {
    name: 'endnote',
    placement: settings.endnotes.placement,
    numbering: 'book',
    marker: settings.endnotes.marker,
    preferredMarker: 'arabic',
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
    const marker = series.marker ?? unusedMarker(series.preferredMarker, settings.lang, [...used, ...explicitMarkers])
    used.push(marker)
    return {
      name: series.name,
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
  const active = series.filter(({ name }) => used.has(name))
  const issues: string[] = []
  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      const a = active[left]
      const b = active[right]
      if (!a || !b) continue
      const shared = sharedMarkerEntry(a.marker, b.marker)
      if (shared === undefined) continue
      const suffix = a.markerConflictSuffixes[b.name] ?? b.markerConflictSuffixes[a.name] ?? 'used series must have different markers'
      const leftDescription = noteMarkerDescription(a.marker)
      const rightDescription = noteMarkerDescription(b.marker)
      const conflict = leftDescription === rightDescription ? `are both ${leftDescription}` : `${leftDescription} and ${rightDescription} share mark ${shared}`
      issues.push(`${a.markerLabel} and ${b.markerLabel} markers ${conflict}; ${suffix}`)
    }
  }
  return issues
}
