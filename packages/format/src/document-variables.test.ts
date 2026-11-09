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
