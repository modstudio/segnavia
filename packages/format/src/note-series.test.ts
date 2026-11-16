import { describe, expect, test } from 'bun:test'
import { Book } from './book.ts'
import { noteMarkerIssues, resolveLineKeyedNoteSystem, resolveNoteSeries } from './note-series.ts'
import type { NoteMarker } from './numbering.ts'

const settings = (lang?: string) => ({
  lang,
  footnotes: { restart: 'chapter' as const },
  endnotes: { placement: 'book' as const },
  notes: [],
})

describe('note series', () => {
  test('resolves contents fields and refuses them outside book placement', () => {
    const resolved = Book.parse({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      body: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
      notes: [{ name: 'endnote', contents: false, contentsLabel: 'References' }],
    })
    expect(resolved.notes[1]).toMatchObject({ name: 'endnote', placement: 'book', contents: false, contentsLabel: 'References' })
    expect(resolved.notes[0]).toMatchObject({ name: 'footnote', placement: 'page' })
    expect(resolved.notes[0]).not.toHaveProperty('contents')
    expect(Book.parse(resolved)).toEqual(resolved)

    for (const notes of [
      [{ name: 'endnote', placement: 'chapter', contents: true }],
      [{ name: 'sources', placement: 'part', numbering: 'part', contentsLabel: 'Sources' }],
    ]) {
      expect(() => Book.parse({ ...resolved, notes })).toThrow(/note series .* uses contents.* remove contents.* or set placement: 'book'/)
    }
    expect(() =>
      Book.parse({
        ...resolved,
        endnotes: { placement: 'chapter' },
        notes: [{ name: 'endnote', contentsLabel: 'References' }],
      }),
    ).toThrow(/note series endnote uses contentsLabel.* remove contentsLabel.* or set placement: 'book'/)
    expect(() => Book.parse({ ...resolved, notes: [{ name: 'endnote', contents: 'yes' }] })).toThrow('expected boolean')
  })

  test('omits contents fields from resolved non-book series', () => {
    const resolved = Book.parse({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      body: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
      endnotes: { placement: 'chapter' },
    })
    expect(resolved.notes[1]).toMatchObject({ name: 'endnote', placement: 'chapter' })
    expect(resolved.notes[1]).not.toHaveProperty('contents')
    expect(resolved.notes[1]).not.toHaveProperty('contentsLabel')
  })

  test('resolves line keys, separators and their number system', () => {
    expect(resolveLineKeyedNoteSystem(undefined, 'hebrew')).toBe('hebrew')
    expect(resolveLineKeyedNoteSystem('roman-upper', 'hebrew')).toBe('roman-upper')
    expect(() => resolveLineKeyedNoteSystem('symbols', 'arabic')).toThrow('marker must be a number system')
    expect(
      resolveNoteSeries({
        ...settings(),
        lineNumberSystem: 'hebrew',
        notes: [{ name: 'sources', key: 'line', lemmaSeparator: ':', placement: 'page', numbering: 'book' }],
      })[2],
    ).toMatchObject({ name: 'sources', key: 'line', lemmaSeparator: ':', lineNumberSystem: 'hebrew' })
  })

  test('refuses line keying without line numbers and with a nonnumeric marker', () => {
    const base = {
      title: 'Book',
      mode: 'paginated' as const,
      page: { paper: 'a5' as const, margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      body: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
      notes: [{ name: 'sources', key: 'line' as const, placement: 'page' as const, numbering: 'book' as const }],
    }
    expect(() => Book.parse(base)).toThrow('add lineNumbers to clear this refusal')
    expect(() => Book.parse({ ...base, lineNumbers: {}, notes: [{ ...base.notes[0], marker: 'symbols' }] })).toThrow('marker must be a number system')
  })

  test('refuses line keying outside paginated mode', () => {
    expect(() =>
      Book.parse({
        title: 'Book',
        mode: 'continuous',
        lineNumbers: {},
        body: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
        notes: [{ name: 'sources', key: 'line', placement: 'page', numbering: 'book' }],
      }),
    ).toThrow("line-keyed series need paginated mode; use mode 'paginated' or key 'counter' to clear this refusal")
  })
  test('resolves compatible defaults and id stems', () => {
    expect(resolveNoteSeries(settings())).toMatchObject([
      { name: 'footnote', placement: 'page', numbering: 'chapter', marker: 'symbols', title: 'Footnotes', idStem: 'fn', idScope: 'chapter' },
      { name: 'endnote', placement: 'book', numbering: 'book', marker: 'arabic', title: 'Notes', idStem: 'en', idScope: 'numbering' },
    ])
  })

  test('accepts heading numbering and refuses levels outside h2 through h6 at the Book edge', () => {
    const base = {
      title: 'Book',
      mode: 'paginated' as const,
      page: { paper: 'a5' as const, margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      body: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
    }
    expect(Book.parse({ ...base, footnotes: { restart: { heading: 2 } }, notes: [{ name: 'sources', placement: 'book', numbering: { heading: 6 } }] }).notes).toMatchObject([
      { name: 'footnote', numbering: { heading: 2 } },
      { name: 'endnote' },
      { name: 'sources', numbering: { heading: 6 } },
    ])
    for (const heading of [1, 7]) {
      expect(() => Book.parse({ ...base, notes: [{ name: 'sources', placement: 'book', numbering: { heading } }] })).toThrow(
        `heading note numbering level ${heading} is outside 2 to 6`,
      )
    }
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
      footnotes: { restart: 'chapter', marker: 'symbols' },
      notes: [{ name: 'sources', placement: 'book', numbering: 'book', marker: 'symbols' }],
    })
    expect(noteMarkerIssues(series, new Set(['footnote', 'sources']))).toEqual([
      'footnote and note series sources markers are both symbols * § ‖ ¶; used series must have different markers',
    ])
  })

  test('reports every conflicting marker kind and permits disjoint number systems and symbols', () => {
    const conflicts: Array<[NoteMarker, NoteMarker, string]> = [
      ['arabic', 'arabic', 'footnote and endnote markers are both arabic; the two must differ when both kinds are used'],
      [{ mark: '⁂' }, { mark: '⁂' }, 'footnote and endnote markers are both mark ⁂; the two must differ when both kinds are used'],
      [
        { mark: '†' },
        { symbols: ['*', '†'] },
        'footnote and endnote markers mark † and symbols * † share mark †; the two must differ when both kinds are used',
      ],
      [
        { symbols: ['*', '§'] },
        { symbols: ['†', '§'] },
        'footnote and endnote markers symbols * § and symbols † § share mark §; the two must differ when both kinds are used',
      ],
      [{ mark: '1' }, 'arabic', 'footnote and endnote markers mark 1 and arabic share mark 1; the two must differ when both kinds are used'],
      [{ symbols: ['*'] }, { mark: '**' }, 'footnote and endnote markers symbols * and mark ** share mark **; the two must differ when both kinds are used'],
      [{ mark: 'א' }, 'hebrew', 'footnote and endnote markers mark א and hebrew share mark א; the two must differ when both kinds are used'],
    ]
    for (const [footnote, endnote, message] of conflicts) {
      const series = resolveNoteSeries({ ...settings(), footnotes: { restart: 'chapter', marker: footnote }, endnotes: { placement: 'book', marker: endnote } })
      expect(noteMarkerIssues(series, new Set(['footnote', 'endnote']))).toEqual([message])
    }

    const compatible = resolveNoteSeries({
      ...settings(),
      footnotes: { restart: 'chapter', marker: 'arabic' },
      endnotes: { placement: 'book', marker: 'symbols' },
    })
    expect(noteMarkerIssues(compatible, new Set(['footnote', 'endnote']))).toEqual([])
  })

  test('a custom sequence pushes conflicting English defaults to later markers', () => {
    const series = resolveNoteSeries({
      ...settings(),
      notes: [{ name: 'first', placement: 'book', numbering: 'book', marker: { symbols: ['*'] } }],
    })
    expect(series.map(({ marker }) => marker)).toEqual(['arabic', 'roman-lower', { symbols: ['*'] }])
  })

  test('an omitted marker skips a number system that can print an earlier sequence', () => {
    const series = resolveNoteSeries({
      ...settings(),
      notes: [
        { name: 'first', placement: 'book', numbering: 'book', marker: { symbols: ['i'] } },
        { name: 'second', placement: 'book', numbering: 'book' },
      ],
    })
    expect(series[2]?.marker).toEqual({ symbols: ['i'] })
    expect(series[3]?.marker).toBe('hebrew')
  })

  test('default series avoid a supplied custom marker declared after them', () => {
    const series = resolveNoteSeries({
      ...settings(),
      notes: [{ name: 'author', placement: 'book', numbering: 'book', marker: { mark: '*' } }],
    })
    expect(series.map(({ marker }) => marker)).toEqual(['arabic', 'roman-lower', { mark: '*' }])
  })
})
