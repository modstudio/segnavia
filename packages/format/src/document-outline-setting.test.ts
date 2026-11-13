import { expect, test } from 'bun:test'
import { Document } from './document.ts'

test('defaults outline depth for books and printed documents and refuses it for page and deck documents', () => {
  expect(
    Document.parse({
      type: 'document',
      kind: 'book',
      title: 'Book',
      mode: 'continuous',
      children: [{ type: 'section', title: 'One', children: [{ type: 'flow', html: '<p>Body</p>' }] }],
    }).outline,
  ).toEqual({ depth: 6 })
  expect(
    Document.parse({
      type: 'document',
      kind: 'printed',
      outline: { depth: 1 },
      print: { paper: 'a4' },
      parentPages: [{ type: 'parentPage', name: 'body', geometry: {} }],
      parentRules: [{ parent: 'body' }],
      children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
    }).outline,
  ).toEqual({ depth: 1 })
  expect(
    Document.parse({
      type: 'document',
      kind: 'printed',
      outline: {},
      print: { paper: 'a4' },
      parentPages: [{ type: 'parentPage', name: 'body', geometry: {} }],
      parentRules: [{ parent: 'body' }],
      children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
    }).outline,
  ).toEqual({ depth: 6 })
  for (const input of [
    { type: 'document', kind: 'page', outline: { depth: 2 }, children: [{ type: 'page', body: { html: '<p>Body</p>' } }] },
    { type: 'document', kind: 'deck', title: 'Deck', outline: { depth: 2 }, children: [{ type: 'slide', content: { kind: 'html', html: '' } }] },
  ]) {
    expect(() => Document.parse(input)).toThrow(/root field outline is not allowed/)
  }
})
