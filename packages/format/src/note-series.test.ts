import { describe, expect, test } from 'bun:test'
import { noteMarkerIssues, resolveNoteSeries } from './note-series.ts'

const settings = (lang?: string) => ({
  lang,
  footnotes: { restart: 'chapter' as const },
  endnotes: { placement: 'book' as const },
  notes: [],
})

describe('note series', () => {
  test('resolves compatible defaults and id stems', () => {
    expect(resolveNoteSeries(settings())).toEqual([
      { name: 'footnote', placement: 'page', numbering: 'chapter', marker: 'symbols', title: 'Footnotes', idStem: 'fn', idScope: 'chapter' },
      { name: 'endnote', placement: 'book', numbering: 'book', marker: 'arabic', title: 'Notes', idStem: 'en', idScope: 'numbering' },
    ])
  })

  test('overrides defaults and chooses the first unused marker for a third series', () => {
    expect(
      resolveNoteSeries({
        ...settings('he'),
        notes: [
          { name: 'endnote', placement: 'part', numbering: 'part', marker: 'symbols', title: 'ביאור' },
          { name: 'sources', placement: 'book', numbering: 'book' },
        ],
      }),
    ).toEqual([
      { name: 'footnote', placement: 'page', numbering: 'chapter', marker: 'hebrew', title: 'מקורות', idStem: 'fn', idScope: 'chapter' },
      { name: 'endnote', placement: 'part', numbering: 'part', marker: 'symbols', title: 'ביאור', idStem: 'en', idScope: 'numbering' },
      { name: 'sources', placement: 'book', numbering: 'book', marker: 'arabic', title: 'sources', idStem: 'note-sources', idScope: 'numbering' },
    ])
  })

  test('reports every used pair sharing a marker', () => {
    const series = resolveNoteSeries({
      ...settings(),
      notes: [{ name: 'sources', placement: 'book', numbering: 'book', marker: 'symbols' }],
    })
    expect(noteMarkerIssues(series, new Set(['footnote', 'sources']))).toEqual([
      'note series footnote and sources markers are both symbols; used series must have different markers',
    ])
  })
})
