import { type NoteSeriesInput, resolveLineKeyedNoteSystem } from './note-series.ts'
import { defaultPageNumbering, type NumberSystem } from './numbering.ts'

interface LineKeyedSeriesSettings {
  lang?: string
  mode: 'continuous' | 'paginated'
  lineNumbers?: { system?: NumberSystem }
  notes: NoteSeriesInput[]
}

interface NoteSeriesIssue {
  path: (string | number)[]
  message: string
}

/** Validates the book settings required to resolve line-keyed note labels. */
export function lineKeyedNoteSeriesIssues(settings: LineKeyedSeriesSettings): NoteSeriesIssue[] {
  const issues: NoteSeriesIssue[] = []
  settings.notes.forEach((series, index) => {
    if (series.key !== 'line') return
    if (settings.mode !== 'paginated') {
      issues.push({
        path: ['notes', index, 'key'],
        message: `note series ${series.name} is keyed to lines but line-keyed series need paginated mode; use mode 'paginated' or key 'counter' to clear this refusal`,
      })
    }
    if (settings.lineNumbers === undefined) {
      issues.push({
        path: ['notes', index, 'key'],
        message: `note series ${series.name} is keyed to lines but the document has no lineNumbers setting; add lineNumbers to clear this refusal`,
      })
    }
    if (series.marker === undefined) return
    try {
      resolveLineKeyedNoteSystem(series.marker, settings.lineNumbers?.system ?? defaultPageNumbering(settings.lang))
    } catch (error) {
      issues.push({ path: ['notes', index, 'marker'], message: error instanceof Error ? error.message : String(error) })
    }
  })
  return issues
}
