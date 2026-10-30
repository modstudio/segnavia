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
    expect(resolveNoteSeries(settings())).toMatchObject([
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
    ).toMatchObject([
      { name: 'footnote', placement: 'page', numbering: 'chapter', marker: 'hebrew', title: 'מקורות', idStem: 'fn', idScope: 'chapter' },
      { name: 'endnote', placement: 'part', numbering: 'part', marker: 'symbols', title: 'ביאור', idStem: 'en', idScope: 'numbering' },
      { name: 'sources', placement: 'book', numbering: 'book', marker: 'arabic', title: 'sources', idStem: 'note-sources', idScope: 'numbering' },
    ])
  })

  test('overlays a partial declaration on each default series', () => {
    expect(
      resolveNoteSeries({
        ...settings(),
        notes: [
          { name: 'footnote', placement: 'book' },
          { name: 'endnote', placement: 'chapter' },
        ],
      }),
    ).toMatchObject([
      {
        name: 'footnote',
        placement: 'book',
        numbering: 'chapter',
        marker: 'symbols',
        title: 'Footnotes',
        idStem: 'fn',
        bodyClass: 'segnavia-footnote',
      },
      {
        name: 'endnote',
        placement: 'chapter',
        numbering: 'book',
        marker: 'arabic',
        title: 'Notes',
        idStem: 'en',
        bodyClass: 'segnavia-endnote',
      },
    ])
  })

  test('reports every used pair sharing a marker', () => {
    const series = resolveNoteSeries({
      ...settings(),
      notes: [{ name: 'sources', placement: 'book', numbering: 'book', marker: 'symbols' }],
    })
    expect(noteMarkerIssues(series, new Set(['footnote', 'sources']))).toEqual([
      'footnote and note series sources markers are both symbols; used series must have different markers',
    ])
  })
})
