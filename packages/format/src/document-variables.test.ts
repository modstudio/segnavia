import { expect, test } from 'bun:test'
import { Document } from './document.ts'

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
