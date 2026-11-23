import { expect, test } from 'bun:test'
import { z } from 'zod'
import { Book } from './book.ts'
import { Document } from './document.ts'
import { bookFromDocument } from './document-lowering.ts'
import { VariableNode } from './document-nodes-book.ts'

test('parses typed variables and refuses invalid names and references with remedies', () => {
  const base = {
    type: 'document' as const,
    kind: 'book' as const,
    title: 'Book',
    mode: 'continuous' as const,
    children: [{ type: 'flow' as const, title: 'Section', html: '<p data-variable="topic">Body</p>' }],
  }
  expect(
    Document.parse({
      ...base,
      variables: [
        { type: 'variable', name: 'topic', kind: 'text', from: 'content' },
        { type: 'variable', name: 'folio', kind: 'folio' },
        { type: 'variable', name: 'pages', kind: 'pages', of: 'document' },
      ],
    }).variables,
  ).toMatchObject([
    { name: 'topic', kind: 'text', from: 'content', pick: 'first' },
    { name: 'folio', kind: 'folio', of: 'numbering' },
    { name: 'pages', kind: 'pages', of: 'document' },
  ])
  expect(() => Document.parse(base)).toThrow(
    /data-variable names undeclared variable.*topic.*declare that variable or remove data-variable to clear this refusal/,
  )
  expect(() =>
    Document.parse({
      ...base,
      variables: [
        { type: 'variable', name: 'topic', kind: 'text', from: 'content' },
        { type: 'variable', name: 'topic', kind: 'text', from: 'content' },
      ],
    }),
  ).toThrow(/variable name.*topic.*is declared more than once; keep one declaration or rename one to clear this refusal/)
  expect(() => Document.parse({ ...base, variables: [{ type: 'variable', name: 'segnavia:topic', kind: 'text', from: 'content' }] })).toThrow(
    /variable name.*segnavia:topic.*is reserved for the library; rename it without the segnavia: prefix to clear this refusal/,
  )
})

test('names the document node holding an undeclared data-variable', () => {
  const result = Document.safeParse({
    type: 'document',
    kind: 'book',
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
    templates: [{ type: 'template', name: 'layout', html: '<main data-region="body"></main>' }],
    children: [
      {
        type: 'section',
        title: 'Section',
        template: 'layout',
        children: [{ type: 'page', regions: { body: '<p data-variable="missing">Body</p>' } }],
      },
    ],
  })
  expect(result.success).toBe(false)
  if (result.success) return
  const error = result.error as { issues: Array<{ path: PropertyKey[]; message: string }> }
  expect(error.issues).toContainEqual(
    expect.objectContaining({
      path: ['children', 0, 'children', 0],
      message: expect.stringContaining('children[0].children[0]: data-variable names undeclared variable "missing"'),
    }),
  )
})

test('refuses a data-motif field on an element without data-motif', () => {
  expect(() =>
    Document.parse({
      type: 'document',
      kind: 'page',
      children: [{ type: 'page', body: { html: '<h1 data-motif-title="Held">Title</h1>' } }],
    }),
  ).toThrow(/children\[0\]: <h1> data-motif-title needs data-motif on the same element; add data-motif or remove data-motif-title to clear this refusal/)
})

test('refuses retired slot paths while leaving host-declared paths for the merged slot check', () => {
  const base = {
    type: 'document' as const,
    kind: 'book' as const,
    title: 'Book',
    mode: 'continuous' as const,
    children: [{ type: 'flow' as const, title: 'Section', html: '<p>Body</p>' }],
  }
  expect(() =>
    Document.parse({ ...base, children: [{ type: 'flow', title: 'Section', html: '<p data-slot-value="host.path">Body</p>' }] }),
  ).not.toThrow()
  expect(() =>
    Document.parse({ ...base, children: [{ type: 'flow', title: 'Section', html: '<p data-slot-value="printedPage.number">Body</p>' }] }),
  ).toThrow(
    /retired slot path.*printedPage\.number.*printed-page paths were replaced by folio and pages variables placed through head templates; declare a variable and place it to clear this refusal/,
  )
  expect(() =>
    Document.parse({
      ...base,
      data: { slots: [{ key: 'person.name', label: 'Name', type: 'text' }] },
      templates: [
        {
          type: 'template',
          name: 'record',
          html: '<p data-slot-value="record.title"></p>',
          slots: [{ key: 'title', label: 'Title', type: 'text' }],
        },
      ],
      children: [
        {
          type: 'flow',
          title: 'Section',
          html: '<p data-slot-value="person.name"></p><time data-slot-value="asOf.date"></time>',
        },
      ],
    }),
  ).not.toThrow()
})

test('checks variables and exact motif forms in parent-page regions', () => {
  const base = {
    type: 'document' as const,
    kind: 'printed' as const,
    parentRules: [{ parent: 'body' }],
    print: { paper: 'a4' as const },
    children: [{ type: 'page' as const, body: { html: '<p>Body</p>' } }],
  }
  const region = (html: string) => [
    { type: 'parentPage' as const, name: 'body', regions: { head: { edge: 'blockStart' as const, html } } },
  ]
  expect(() => Document.parse({ ...base, parentPages: region('<span data-variable="missing"></span>') })).toThrow(
    /parentPages\[0\]\.regions\.head: data-variable names undeclared variable .*missing/,
  )
  expect(() => Document.parse({ ...base, parentPages: region('<span data-motif-name="missing"></span>') })).toThrow(
    /parentPages\[0\]\.regions\.head: <span> data-motif-name needs data-motif on the same element/,
  )
  expect(() => Document.parse({ ...base, parentPages: region('<span data-motifs-name="missing"></span>') })).toThrow(
    /parentPages\[0\]\.regions\.head: <span> has malformed motif attribute data-motifs-name/,
  )
  expect(() => Document.parse({ ...base, parentPages: region('<segnavia-motif data-motif-name="x"></segnavia-motif>') })).toThrow(
    /parentPages\[0\]\.regions\.head: <segnavia-motif> is not a document HTML element; place a motif with data-motif/,
  )
})

test('ignores data-motif field text in comments and attribute values', () => {
  expect(() =>
    Document.parse({
      type: 'document',
      kind: 'page',
      children: [
        {
          type: 'page',
          body: { html: '<!-- data-motif-comment --><a href="/x?data-motif-link=1" title="data-motif-title=x">Link</a>' },
        },
      ],
    }),
  ).not.toThrow()
})

test('names template html holding an undeclared data-variable', () => {
  const result = Document.safeParse({
    type: 'document',
    kind: 'book',
    title: 'Book',
    mode: 'continuous',
    templates: [{ type: 'template', name: 'layout', html: '<main data-variable="missing"></main>' }],
    children: [{ type: 'flow', title: 'Body', html: '<p>Body</p>' }],
  })
  expect(result.success).toBe(false)
  if (result.success) return
  expect((result.error as { issues: Array<{ path: PropertyKey[]; message: string }> }).issues).toContainEqual(
    expect.objectContaining({
      path: ['templates', 0],
      message: expect.stringContaining('templates[0]: data-variable names undeclared variable "missing"'),
    }),
  )
})

test('validates head template placements and parts at parse', () => {
  const base = {
    type: 'document' as const,
    kind: 'printed' as const,
    parentRules: [{ parent: 'body' }],
    print: { paper: 'a4' },
    children: [{ type: 'page' as const, body: { html: '<p>Body</p>' } }],
  }
  expect(() =>
    Document.parse({
      ...base,
      parentPages: [
        {
          type: 'parentPage',
          name: 'body',
          regions: { head: { edge: 'blockStart', html: '<span data-motif="segnavia:head-template" data-motif-name="missing"></span>' } },
        },
      ],
    }),
  ).toThrow(/placement names undeclared template.*missing/)
  expect(() =>
    Document.parse({
      ...base,
      parentPages: [
        {
          type: 'parentPage',
          name: 'body',
          regions: {
            head: {
              edge: 'blockStart',
              html: '<span data-motif="ornament" data-motif-name="host"></span><span data-motif="segnavia:head-template"></span>',
            },
          },
        },
      ],
    }),
  ).toThrow(/head-template placement has no data-motif-name; add data-motif-name or remove the placement to clear this refusal/)
  expect(() =>
    Document.parse({
      ...base,
      parentPages: [
        {
          type: 'parentPage',
          name: 'body',
          regions: { head: { edge: 'blockStart', html: '<span data-motif="segnavia:head-template"></span>' } },
        },
      ],
    }),
  ).toThrow(/head-template placement has no data-motif-name; add data-motif-name or remove the placement to clear this refusal/)
  expect(() =>
    Document.parse({
      ...base,
      parentPages: [{ type: 'parentPage', name: 'body' }],
      headTemplates: [{ type: 'headTemplate', name: 'head', parts: [{ variable: 'missing' }] }],
    }),
  ).toThrow(/undeclared variable.*missing/)
  expect(() =>
    Document.parse({
      ...base,
      parentPages: [{ type: 'parentPage', name: 'body' }],
      headTemplates: [{ type: 'headTemplate', name: 'head', parts: [{ record: 'missing' }] }],
    }),
  ).toThrow(/undeclared record slot.*missing/)
  expect(() =>
    Document.parse({
      ...base,
      parentPages: [{ type: 'parentPage', name: 'body' }],
      variables: [{ type: 'variable', name: 'record-index', kind: 'record', value: 'position' }],
    }),
  ).toThrow(/index|count/)
})

test('part-title variables name an existing document part', () => {
  const base = {
    type: 'document' as const,
    kind: 'book' as const,
    title: 'Book',
    mode: 'continuous' as const,
    children: [
      {
        type: 'part' as const,
        name: 'gate',
        children: [{ type: 'section' as const, title: 'Section', children: [{ type: 'flow' as const, html: '<p>Body</p>' }] }],
      },
    ],
  }
  expect(
    Document.parse({
      ...base,
      variables: [{ type: 'variable', name: 'part', kind: 'text', from: 'part-title', part: 'gate' }],
    }).variables,
  ).toMatchObject([{ name: 'part', kind: 'text', from: 'part-title', part: 'gate', pick: 'first' }])
  expect(() =>
    Document.parse({
      ...base,
      variables: [{ type: 'variable', name: 'part', kind: 'text', from: 'part-title', part: 'missing' }],
    }),
  ).toThrow(/part-title variable.*part.*names unknown part.*missing.*name an existing part or remove the variable to clear this refusal/)
  expect(() => Document.parse({ ...base, variables: [{ type: 'variable', name: 'part', kind: 'text', from: 'part-title' }] })).toThrow(/part/)
  expect(() => Document.parse({ ...base, variables: [{ type: 'variable', name: 'part', kind: 'text', from: 'content', part: 'gate' }] })).toThrow(
    /Invalid input/,
  )
})

test('content variable node schema excludes part', () => {
  const schema = z.toJSONSchema(VariableNode, { io: 'input' }) as {
    oneOf?: Array<{ oneOf?: Array<{ properties?: Record<string, unknown> }> }>
  }
  const content = schema.oneOf?.[0]?.oneOf?.find((arm) => (arm.properties?.from as { const?: string } | undefined)?.const === 'content')
  expect(content?.properties?.part).toEqual({ not: {} })
})

test('parses declared metadata variables and refuses invalid declarations with remedies', () => {
  const base = {
    type: 'document' as const,
    kind: 'book' as const,
    metadata: { title: 'Book', extra: { edition: 'Second' } },
    mode: 'continuous' as const,
    children: [{ type: 'flow' as const, title: 'Section', html: '<p>Body</p>' }],
  }
  expect(
    Document.parse({
      ...base,
      variables: [{ type: 'variable', name: 'edition', kind: 'meta', field: 'edition' }],
    }).variables,
  ).toMatchObject([{ kind: 'meta', field: 'edition' }])
  expect(() =>
    Document.parse({
      ...base,
      variables: [{ type: 'variable', name: 'date', kind: 'date', date: '2024-03-24', calendar: 'hebrew', format: 'long' }],
    }),
  ).toThrow()
  expect(() => Document.parse({ ...base, variables: [{ type: 'variable', name: 'missing', kind: 'meta', field: 'missing' }] })).toThrow(
    /unknown metadata field.*missing.*declare metadata.extra.missing to clear this refusal/,
  )
  for (const field of ['lang', 'Title']) {
    expect(() => Document.parse({ ...base, variables: [{ type: 'variable', name: 'reserved', kind: 'meta', field }] })).toThrow(
      new RegExp(`unknown metadata field.*${field}.*choose a metadata.extra key accepted by DocumentMetadata, or remove the variable.*clear this refusal`),
    )
  }
  expect(() =>
    Document.parse({
      ...base,
      settings: { lang: 'en-US-x' },
      variables: [{ type: 'variable', name: 'title', kind: 'meta', field: 'title' }],
    }),
  ).toThrow(/language tag.*en-US-x.*valid BCP 47 lang to clear this refusal/)
  expect(() => Document.parse({ ...base, settings: { lang: 'he_IL' } })).not.toThrow()
})

test('refuses metadata variables for printed documents that have no metadata', () => {
  expect(() =>
    Document.parse({
      type: 'document',
      kind: 'printed',
      print: { paper: 'a4' },
      parentPages: [{ type: 'parentPage', name: 'body' }],
      parentRules: [{ parent: 'body' }],
      variables: [{ type: 'variable', name: 'title', kind: 'meta', field: 'title' }],
      children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
    }),
  ).toThrow(/printed document has no metadata.*remove the variable or use a book document to clear this refusal/)
})

test('a document-lowered book stores authored definitions and re-parses after JSON', () => {
  const document = Document.parse({
    type: 'document',
    kind: 'book',
    title: 'Book',
    mode: 'continuous',
    variables: [{ type: 'variable', name: 'topic', kind: 'text', from: 'content' }],
    headTemplates: [{ type: 'headTemplate', name: 'topic-head', parts: [{ variable: 'topic' }] }],
    children: [
      {
        type: 'part',
        name: 'body',
        children: [{ type: 'section', title: 'Section', children: [{ type: 'flow', html: '<p data-variable="topic">Body</p>' }] }],
      },
    ],
  })
  const book = bookFromDocument(document)
  expect(book.variables.map(({ name }) => name)).toEqual(['topic'])
  expect(book.headTemplates.map(({ name }) => name)).toEqual(['topic-head'])
  expect(Book.parse(JSON.parse(JSON.stringify(book)))).toEqual(book)
})
