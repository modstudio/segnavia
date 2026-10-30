import { z } from 'zod'
import { isHebrew, NoteMarker, type NoteMarker as NoteMarkerValue } from './numbering.ts'

export const NotePlacement = z.enum(['page', 'chapter', 'part', 'book'])
export type NotePlacement = z.infer<typeof NotePlacement>

export const NoteNumbering = z.enum(['chapter', 'part', 'book'])
export type NoteNumbering = z.infer<typeof NoteNumbering>

export const NoteSeries = z.object({
  name: z.string().regex(/^[A-Za-z][\w-]*$/, 'a note series name must be an HTML name token'),
  placement: NotePlacement,
  numbering: NoteNumbering,
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
}

interface NoteSeriesSettings {
  lang?: string
  footnotes: { marker?: NoteMarkerValue; restart: 'chapter' | 'book' }
  endnotes: { marker?: NoteMarkerValue; placement: 'book' | 'chapter'; title?: string }
  notes: NoteSeriesInput[]
}

function markerOrder(lang: string | undefined): NoteMarkerValue[] {
  return isHebrew(lang) ? ['hebrew', 'arabic', 'symbols', 'roman-lower'] : ['symbols', 'arabic', 'roman-lower', 'hebrew']
}

function unusedMarker(lang: string | undefined, used: Set<NoteMarkerValue>): NoteMarkerValue {
  return markerOrder(lang).find((marker) => !used.has(marker)) ?? 'symbols'
}

export function resolveNoteSeries(settings: NoteSeriesSettings): ResolvedNoteSeries[] {
  const hebrew = isHebrew(settings.lang)
  const declared = new Map(settings.notes.map((series) => [series.name, series]))
  const inputs: NoteSeriesInput[] = [
    declared.get('footnote') ?? {
      name: 'footnote',
      placement: 'page',
      numbering: settings.footnotes.restart,
      marker: settings.footnotes.marker ?? (hebrew ? 'hebrew' : 'symbols'),
      title: hebrew ? 'מקורות' : 'Footnotes',
    },
    declared.get('endnote') ?? {
      name: 'endnote',
      placement: settings.endnotes.placement,
      numbering: 'book',
      marker: settings.endnotes.marker ?? 'arabic',
      title: settings.endnotes.title ?? (hebrew ? 'הערות' : 'Notes'),
    },
    ...settings.notes.filter(({ name }) => name !== 'footnote' && name !== 'endnote'),
  ]
  const used = new Set<NoteMarkerValue>()
  return inputs.map((series) => {
    const marker = series.marker ?? unusedMarker(settings.lang, used)
    used.add(marker)
    return {
      name: series.name,
      placement: series.placement,
      numbering: series.numbering,
      marker,
      title: series.title ?? series.name,
      idStem: series.name === 'footnote' ? 'fn' : series.name === 'endnote' ? 'en' : `note-${series.name}`,
      idScope: series.name === 'footnote' ? 'chapter' : 'numbering',
    }
  })
}

export function noteSeriesIssues(series: ResolvedNoteSeries[], mode: 'continuous' | 'paginated'): Array<{ path: (string | number)[]; message: string }> {
  const issues: Array<{ path: (string | number)[]; message: string }> = []
  const names = new Set<string>()
  series.forEach((item, index) => {
    if (names.has(item.name)) {
      issues.push({ path: ['notes', index, 'name'], message: `note series ${item.name} is duplicated; give every series a unique name` })
    }
    names.add(item.name)
    if (mode === 'continuous' && (item.placement === 'chapter' || item.placement === 'part')) {
      issues.push({
        path: ['notes', index, 'placement'],
        message: `note series ${item.name} uses ${item.placement} placement only available in paginated mode; use page or book placement, or paginated mode`,
      })
    }
  })
  const page = series.filter(({ placement }) => placement === 'page')
  if (page.length > 1) {
    issues.push({ path: ['notes'], message: `note series ${page.map(({ name }) => name).join(' and ')} are both page-placed; declare one page-placed series` })
  }
  return issues
}

export function noteMarkerIssues(
  source: ResolvedNoteSeries[] | { notes: ResolvedNoteSeries[] },
  usage: ReadonlySet<string> | { footnotes: boolean; endnotes: boolean },
): string[] {
  const series = Array.isArray(source) ? source : source.notes
  const used = 'footnotes' in usage ? new Set([...(usage.footnotes ? ['footnote'] : []), ...(usage.endnotes ? ['endnote'] : [])]) : usage
  const active = series.filter(({ name }) => used.has(name))
  const issues: string[] = []
  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      const a = active[left]
      const b = active[right]
      if (!a || !b) continue
      if (a.marker !== b.marker) continue
      issues.push(
        a.name === 'footnote' && b.name === 'endnote'
          ? `footnote and endnote markers are both ${a.marker}; the two must differ when both kinds are used`
          : `note series ${a.name} and ${b.name} markers are both ${a.marker}; used series must have different markers`,
      )
    }
  }
  return issues
}
