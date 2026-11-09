import { describe, expect, test } from 'bun:test'
import { Document } from './document.ts'

function ids(prefix = 'id') {
  let value = 0
  return () => `${prefix}-${++value}`
}

test('mints stable ids for every node and definition while preserving supplied ids', () => {
  const newId = ids()
  const input = {
    type: 'document' as const,
    kind: 'book' as const,
    id: 'document-id',
    title: 'Book',
    mode: 'continuous' as const,
    children: [
      {
        type: 'division' as const,
        name: 'body' as const,
        children: [{ type: 'section' as const, title: 'Section', children: [{ type: 'flow' as const, html: '<p>Body</p>' }] }],
      },
    ],
    parentPages: [{ type: 'parentPage' as const, name: 'normal', geometry: {} }],
    templates: [{ type: 'template' as const, name: 'chapter', html: '<p>Template</p>' }],
    noteSeries: [{ type: 'noteSeries' as const, name: 'notes' }],
  }
  const parsed = Document.parse(input, { newId })
  expect(parsed.id).toBe('document-id')
  expect(parsed.children[0]?.id).toBe('id-1')
  const division = parsed.children[0]
  expect(division && 'children' in division ? division.children[0]?.id : undefined).toBe('id-2')
  expect(parsed.parentPages[0]?.id).toBe('id-4')
  expect(parsed.templates[0]?.id).toBe('id-5')
  expect(parsed.noteSeries[0]?.id).toBe('id-6')
  expect(Document.parse(parsed, { newId })).toEqual(parsed)
})

test('refuses duplicate node ids with both nodes and the clearance', () => {
  expect(() =>
    Document.parse(
      {
        type: 'document',
        kind: 'book',
        title: 'Book',
        mode: 'continuous',
        children: [{ type: 'section', id: 'same', title: 'Section', children: [{ type: 'flow', id: 'same', html: '<p>Body</p>' }] }],
      },
      { newId: ids() },
    ),
  ).toThrow(/id "same".*section.*flow.*change or remove one id to clear this refusal/)
})

import { jsonSchemas } from './json-schemas.ts'

describe('Document', () => {
  test('keeps optional ids and refuses nodes outside the kind profile', () => {
    const parsed = Document.parse({ type: 'document', id: 'page-doc', kind: 'page', children: [{ type: 'page', id: 'body', body: { html: '<p>Body</p>' } }] })
    expect(parsed.id).toBe('page-doc')
    expect(parsed.children[0]?.id).toBe('body')
    expect(() => Document.parse({ type: 'document', kind: 'deck', children: [{ type: 'flow', html: '<p>Body</p>' }] })).toThrow(
      'node flow is not allowed in a deck document; use one of slide to clear this refusal',
    )
  })

  test('refuses reserved conditions with a remedy', () => {
    expect(() =>
      Document.parse({
        type: 'document',
        kind: 'page',
        children: [{ type: 'page', body: { html: '' } }],
        conditions: [{ type: 'condition', name: 'edition' }],
      }),
    ).toThrow('condition edition is not yet supported; remove it to clear this refusal')
  })

  test('refuses root fields outside the kind profile', () => {
    expect(() => Document.parse({ type: 'document', kind: 'book', transition: { kind: 'fade' }, children: [] })).toThrow(
      /root field transition is not allowed in a book document; use one of .*mode.* to clear this refusal/,
    )
    expect(() =>
      Document.parse({ type: 'document', kind: 'deck', footnotes: { restart: 'chapter' }, children: [{ type: 'slide', content: { kind: 'html', html: '' } }] }),
    ).toThrow(/root field footnotes is not allowed in a deck document; use one of .*transition.* to clear this refusal/)
  })

  test('uses settings.dir for boards and refuses unsupported direction values', () => {
    expect(() => Document.parse({ type: 'document', kind: 'board', settings: { dir: 'auto' }, children: [] })).toThrow(
      'settings.dir value auto is not allowed in a board document; use one of ltr, rtl to clear this refusal',
    )
  })

  test.each(['scripts', 'lang'] as const)('refuses unused board settings.%s through its profile', (field) => {
    const value = field === 'scripts' ? 'refuse' : 'he'
    expect(() => Document.parse({ type: 'document', kind: 'board', settings: { dir: 'rtl', [field]: value }, children: [] })).toThrow(
      `settings field ${field} is not allowed in a board document; use one of dir to clear this refusal`,
    )
  })

  test('keeps the scripts default only for profiles that admit scripts', () => {
    expect(
      Document.parse({
        type: 'document',
        kind: 'deck',
        title: 'Deck',
        settings: { lang: 'he' },
        children: [{ type: 'slide', id: 'one', content: { kind: 'html', html: '' } }],
      }).settings,
    ).toEqual({ scripts: 'refuse', lang: 'he' })
    expect(Document.parse({ type: 'document', kind: 'board', title: 'Board', settings: { dir: 'rtl' }, children: [] }).settings).toEqual({ dir: 'rtl' })
  })

  test('keeps direction policy in profiles and refuses limits where the current pipeline cannot carry them', () => {
    expect(
      Document.parse({ type: 'document', kind: 'book', title: 'Book', mode: 'continuous', settings: { dir: 'auto' }, limits: { pages: 12 }, children: [] })
        .limits,
    ).toEqual({ pages: 12 })
    expect(() => Document.parse({ type: 'document', kind: 'board', limits: { pages: 12 }, children: [] })).toThrow(
      'document field limits is not yet supported; remove it to clear this refusal',
    )
  })

  test('refuses profile requirements before an internal parser can fail', () => {
    const values = [
      { type: 'document', kind: 'deck', title: 'Empty', children: [] },
      { type: 'document', kind: 'board', settings: { dir: 'ltr' }, children: [] },
      { type: 'document', kind: 'board', title: 'Board', children: [] },
      { type: 'document', kind: 'page', children: [{ type: 'page' }] },
      {
        type: 'document',
        kind: 'printed',
        children: [
          { type: 'page', body: { html: '' } },
          { type: 'flow', html: '' },
        ],
      },
    ]
    for (const value of values) expect(() => Document.parse(value)).toThrow('clear this refusal')
  })

  test('refuses book structures and fields that its lowering cannot carry', () => {
    const root = { type: 'document' as const, kind: 'book' as const, title: 'Book', mode: 'continuous' as const }
    const values = [
      {
        ...root,
        children: [
          { type: 'division', name: 'body', children: [] },
          { type: 'flow', title: 'Loose', html: '' },
        ],
      },
      {
        ...root,
        children: [
          {
            type: 'section',
            title: 'One',
            children: [
              { type: 'flow', html: '' },
              { type: 'placed', kind: 'page', address: 'x' },
            ],
          },
        ],
      },
      {
        ...root,
        children: [{ type: 'division', name: 'end', settings: { numbering: { system: 'arabic', start: 1, restart: false, counted: true } }, children: [] }],
      },
      { ...root, children: [{ type: 'section', title: 'One', template: 'body', children: [{ type: 'flow', html: '' }] }] },
      { ...root, children: [{ type: 'section', title: 'One', contents: false, children: [{ type: 'flow', html: '' }] }] },
      { ...root, children: [{ type: 'section', title: 'One', children: [{ type: 'flow', title: 'Two', html: '' }] }] },
    ]
    for (const value of values) expect(() => Document.parse(value)).toThrow('clear this refusal')
  })

  test('accepts section numbering and refuses contradictory or invalid values with a remedy', () => {
    const section = (numbering: unknown) => ({
      type: 'document' as const,
      kind: 'book' as const,
      title: 'Book',
      mode: 'paginated' as const,
      page: { paper: 'a5' as const, margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
      children: [{ type: 'section' as const, title: 'One', numbering, children: [{ type: 'flow' as const, html: '' }] }],
    })
    expect(Document.parse(section({ counted: false })).children[0]).toMatchObject({ numbering: { counted: false } })
    expect(Document.parse(section({ restart: 4 })).children[0]).toMatchObject({ numbering: { restart: 4 } })
    expect(() => Document.parse(section({ restart: 0 }))).toThrow('set restart to a positive integer to clear this refusal')
    expect(() => Document.parse(section({ restart: 1.5 }))).toThrow('set restart to a positive integer to clear this refusal')
    expect(() => Document.parse(section({ counted: false, restart: 4 }))).toThrow('remove one of them to clear this refusal')
    expect(() => Document.parse(section({ counted: true }))).toThrow('counted can only be false; remove counted to clear this refusal')
    expect(() => Document.parse(section({ system: 'arabic' }))).toThrow('remove unknown numbering fields to clear this refusal')
    expect(() => Document.parse(section({ start: 4 }))).toThrow('remove unknown numbering fields to clear this refusal')
  })

  test('refuses section numbering for continuous books and accepts it with printed-page rules', () => {
    const section = { type: 'section' as const, id: 'one', title: 'One', numbering: { restart: 4 }, children: [{ type: 'flow' as const, html: '' }] }
    expect(() => Document.parse({ type: 'document', kind: 'book', title: 'Book', mode: 'continuous', children: [section] })).toThrow(
      /use the paginated layout.*clear this refusal/,
    )
    expect(
      Document.parse({
        type: 'document',
        kind: 'printed',
        rules: { every: 'body' },
        parentPages: [{ type: 'parentPage', name: 'body' }],
        children: [section],
      }).children[0],
    ).toMatchObject({ numbering: { restart: 4 } })
  })

  test('refuses invalid printed section forms and fields with remedies', () => {
    const root = {
      type: 'document' as const,
      kind: 'printed' as const,
      rules: { every: 'body' },
      parentPages: [{ type: 'parentPage' as const, name: 'body' }],
    }
    const flow = { type: 'flow' as const, html: '<p>Body</p>' }
    expect(() =>
      Document.parse({
        ...root,
        children: [
          { type: 'page', body: { html: '' } },
          { type: 'section', children: [flow] },
        ],
      }),
    ).toThrow('remove the page or the sections to clear this refusal')
    expect(() => Document.parse({ ...root, children: [{ type: 'section', children: [] }] })).toThrow(
      'replace its children with one flow child to clear this refusal',
    )
    expect(() => Document.parse({ ...root, children: [{ type: 'section', parents: { opener: 'body' }, children: [flow] }] })).toThrow(
      'remove it and use document rules to clear this refusal',
    )
    expect(() => Document.parse({ ...root, children: [{ type: 'section', pageGeometry: 'wide', children: [flow] }] })).toThrow(
      'remove it because printed sections share the document paper to clear this refusal',
    )
    expect(() => Document.parse({ ...root, children: [{ type: 'section', opens: 'continue', children: [flow] }] })).toThrow(
      'use another opens value to clear this refusal',
    )
  })

  test('uses the printed number system to refuse an out-of-range section restart', () => {
    expect(() =>
      Document.parse({
        type: 'document',
        kind: 'printed',
        numbering: 'hebrew',
        rules: { every: 'body' },
        parentPages: [{ type: 'parentPage', name: 'body' }],
        children: [{ type: 'section', title: 'Text', numbering: { restart: 10_000 }, children: [{ type: 'flow', html: '' }] }],
      }),
    ).toThrow('hebrew range 1 to 9999')
  })

  test('accepts template definitions on printed documents', () => {
    const parsed = Document.parse({
      type: 'document',
      kind: 'printed',
      rules: { every: 'body' },
      parentPages: [{ type: 'parentPage', name: 'body' }],
      templates: [{ type: 'template', name: 'record', html: '<p>Record</p>' }],
      children: [{ type: 'page', body: { html: '' } }],
    })
    expect(parsed.templates[0]).toMatchObject({ name: 'record', html: '<p>Record</p>' })
  })

  test('refuses a section restart beyond its division numbering system range', () => {
    expect(() =>
      Document.parse({
        type: 'document',
        kind: 'book',
        title: 'Book',
        mode: 'paginated',
        page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
        numbering: { frontMatter: 'roman-lower', body: 'hebrew' },
        children: [{ type: 'section', id: 'text', title: 'Text', numbering: { restart: 10_000 }, children: [{ type: 'flow', html: '' }] }],
      }),
    ).toThrow('hebrew range 1 to 9999')
  })

  test('refuses nested root fields that each profile does not lower', () => {
    expect(() =>
      Document.parse({
        type: 'document',
        kind: 'deck',
        metadata: { title: 'Deck', authors: ['Dropped'] },
        children: [{ type: 'slide', id: 'one', content: { kind: 'html', html: '' } }],
      }),
    ).toThrow('metadata field authors is not allowed in a deck document')
    expect(() =>
      Document.parse({
        type: 'document',
        kind: 'deck',
        title: 'Deck',
        style: { pageGeometries: {} },
        children: [{ type: 'slide', id: 'one', content: { kind: 'html', html: '' } }],
      }),
    ).toThrow('style field pageGeometries is not allowed in a deck document')
    expect(() =>
      Document.parse({
        type: 'document',
        kind: 'board',
        title: 'Board',
        settings: { dir: 'ltr' },
        style: { tokens: {} },
        children: [],
      }),
    ).toThrow('style field tokens is not allowed in a board document')
    expect(() =>
      Document.parse({
        type: 'document',
        kind: 'printed',
        rules: { every: 'body' },
        parentPages: [{ type: 'parentPage', name: 'body' }],
        children: [{ type: 'page', body: { html: '' }, regions: {} }],
      }),
    ).toThrow('page field regions is not allowed in a printed document')
  })

  test('refuses declared fields that lowering does not yet support', () => {
    const values = [
      { type: 'document', kind: 'book', children: [{ type: 'section', headTemplate: 'running', children: [] }] },
      { type: 'document', kind: 'book', children: [], parentPages: [{ type: 'parentPage', name: 'body', regions: { side: '<aside></aside>' } }] },
      { type: 'document', kind: 'book', children: [], variables: [{ type: 'variable', name: 'folio', valueType: 'folio' }] },
    ]
    for (const value of values) expect(() => Document.parse(value)).toThrow('is not yet supported; remove it to clear this refusal')
  })

  test('accepts a declared book section page geometry and refuses unknown or continuous use', () => {
    const geometry = { paper: 'letter' as const, orientation: 'landscape' as const, margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }
    const bookPage = { paper: 'letter' as const, orientation: 'portrait' as const, margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }
    const base = {
      type: 'document' as const,
      kind: 'book' as const,
      title: 'Book',
      mode: 'paginated' as const,
      page: bookPage,
      style: { pageGeometries: { wide: geometry } },
      children: [{ type: 'section' as const, title: 'Wide', pageGeometry: 'wide', children: [{ type: 'flow' as const, html: '<p>Text</p>' }] }],
    }
    expect(Document.parse(base).children[0]).toMatchObject({ pageGeometry: 'wide' })
    expect(() => Document.parse({ ...base, children: [{ ...base.children[0], pageGeometry: 'missing' }] })).toThrow(
      'declare it in style.pageGeometries, or remove pageGeometry',
    )
    expect(() => Document.parse({ ...base, mode: 'continuous' })).toThrow('use paginated layout, or remove pageGeometry')
  })

  test.each(['deck', 'book', 'printed', 'page', 'board'] as const)('accepts a brand name on a %s document', (kind) => {
    const inputs = {
      deck: { type: 'document', kind, title: 'Deck', brand: 'publisher', children: [{ type: 'slide', content: { kind: 'html', html: '' } }] },
      book: { type: 'document', kind, title: 'Book', mode: 'continuous', brand: 'publisher', children: [] },
      printed: {
        type: 'document',
        kind,
        brand: 'publisher',
        rules: { every: 'body' },
        parentPages: [{ type: 'parentPage', name: 'body' }],
        children: [{ type: 'page', body: { html: '' } }],
      },
      page: { type: 'document', kind, brand: 'publisher', children: [{ type: 'page', body: { html: '' } }] },
      board: { type: 'document', kind, title: 'Board', brand: 'publisher', settings: { dir: 'ltr' }, children: [] },
    } as const
    expect(Document.parse(inputs[kind]).brand).toBe('publisher')
  })

  test('generates the document JSON Schema from the exported manifest', () => {
    const schemas = jsonSchemas()
    expect(schemas).toHaveProperty('document')
    for (const legacy of ['deck', 'page', 'book', 'board']) expect(schemas).not.toHaveProperty(legacy)
  })

  test('profiles accept only the print shape belonging to each trim', () => {
    const deck = { type: 'document', kind: 'deck', title: 'Deck', children: [{ type: 'slide', id: 'one', content: { kind: 'html', html: '' } }] } as const
    expect(Document.parse({ ...deck, print: { bleed: 3 } }).print?.bleed).toBe(3)
    expect(() => Document.parse({ ...deck, print: { paper: 'a4' } })).toThrow("a deck's trim is its slide size")
    expect(() => Document.parse({ ...deck, print: { safe: 100 } })).toThrow('safe must leave area inside the trim')
    const book = {
      type: 'document',
      kind: 'book',
      title: 'Book',
      mode: 'continuous',
      page: { paper: 'a4', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      children: [{ type: 'flow', html: '<p>Body</p>' }],
    } as const
    expect(() => Document.parse({ ...book, print: { paper: 'a4' } })).toThrow("a book's trim is page.paper")
    expect(() => Document.parse({ type: 'document', kind: 'board', title: 'Board', settings: { dir: 'ltr' }, print: { bleed: 3 }, children: [] })).toThrow(
      'a board has no printed piece to trim',
    )
  })
})
