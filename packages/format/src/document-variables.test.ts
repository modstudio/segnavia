import { expect, test } from 'bun:test'
import { Book } from './book.ts'
import { Document } from './document.ts'
import { bookFromDocument } from './document-lowering.ts'

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
      parentPages: [{ type: 'parentPage', name: 'body', head: '<span data-motif="segnavia:head-template" data-motif-name="missing"></span>' }],
    }),
  ).toThrow(/placement names undeclared template.*missing/)
  expect(() =>
    Document.parse({
      ...base,
      parentPages: [
        {
          type: 'parentPage',
          name: 'body',
          head: '<span data-motif="ornament" data-motif-name="host"></span><span data-motif="segnavia:head-template"></span>',
        },
      ],
    }),
  ).toThrow(/placement names undeclared template.*clear this refusal/)
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
  expect(() =>
    Document.parse({ ...base, variables: [{ type: 'variable', name: 'part', kind: 'text', from: 'part-title' }] }),
  ).toThrow(/part/)
  expect(() =>
    Document.parse({ ...base, variables: [{ type: 'variable', name: 'part', kind: 'text', from: 'content', part: 'gate' }] }),
  ).toThrow(/Invalid input/)
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
