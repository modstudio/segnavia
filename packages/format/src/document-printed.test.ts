import { expect, test } from 'bun:test'
import { Document } from './document.ts'
import { printedFromDocument } from './document-lowering.ts'

test('accepts mixed printed children and refuses invalid printed sections', () => {
  const root = {
    type: 'document' as const,
    kind: 'printed' as const,
    print: { paper: 'a4' as const },
    parentRules: [{ parent: 'body' }],
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
  ).not.toThrow()
  expect(() => Document.parse({ ...root, children: [{ type: 'section', children: [] }] })).toThrow('replace its children to clear this refusal')
  expect(() => Document.parse({ ...root, children: [{ type: 'section', orientation: 'landscape', children: [flow] }] })).toThrow(
    'name a pageGeometry declared in style.pageGeometries to clear this refusal',
  )
  expect(() =>
    Document.parse({
      ...root,
      style: {
        pageGeometries: {
          wide: {
            paper: 'a4',
            orientation: 'landscape',
            margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
          },
        },
      },
      children: [{ type: 'section', pageGeometry: 'wide', children: [flow] }],
    }),
  ).not.toThrow()
  expect(() => Document.parse({ ...root, children: [{ type: 'section', opens: 'continue', children: [flow] }] })).toThrow(
    'use another opens value to clear this refusal',
  )
})

test('lowers printed sections with their plan fields and keeps Hebrew settings', () => {
  const document = Document.parse({
    type: 'document',
    kind: 'printed',
    settings: { lang: 'he' },
    print: { paper: 'a4' },
    parentRules: [{ parent: 'body' }],
    parentPages: [{ type: 'parentPage', name: 'body' }],
    children: [
      {
        type: 'section',
        id: 'cover',
        title: 'Cover',
        opens: 'recto',
        numbering: { counted: false },
        children: [{ type: 'flow', html: '<h1>Cover</h1>' }],
      },
      {
        type: 'section',
        id: 'body',
        title: 'Body',
        opens: 'any',
        children: [{ type: 'flow', html: '<p>Body</p>' }],
      },
    ],
  })
  const lowered = printedFromDocument(document)
  expect(lowered.lang).toBe('he')
  expect(lowered.printedPages?.sections).toEqual([
    { id: 'cover', title: 'Cover', opens: 'recto', numbering: { counted: false }, html: '<h1>Cover</h1>' },
    { id: 'body', title: 'Body', opens: 'any', html: '<p>Body</p>' },
  ])
  expect(lowered.body).toBeUndefined()
})

test('lowers printed line-number settings into printed pages', () => {
  const document = Document.parse({
    type: 'document',
    kind: 'printed',
    settings: { lineNumbers: { interval: 5, restart: 'page' } },
    print: { paper: 'a4' },
    parentPages: [{ type: 'parentPage', name: 'body' }],
    parentRules: [{ parent: 'body' }],
    children: [{ type: 'page', body: { html: '<p>Numbered</p>' } }],
  })

  expect(printedFromDocument(document).printedPages?.lineNumbers).toEqual(document.settings?.lineNumbers)
})

test('keeps designed pages, flowing sections, and records in author order', () => {
  const document = Document.parse({
    type: 'document',
    kind: 'printed',
    print: { paper: 'a4' },
    parentPages: [{ type: 'parentPage', name: 'body' }],
    parentRules: [{ parent: 'body' }],
    children: [
      { type: 'page', id: 'cover', body: { html: '<h2>Cover one</h2><h2>Cover two</h2>' } },
      { type: 'section', id: 'text', pageGeometry: 'wide', children: [{ type: 'flow', html: '<p>Text</p>' }] },
      { type: 'section', id: 'answer', children: [{ type: 'page', body: { html: '<p>Answer</p>' } }] },
    ],
    style: {
      pageGeometries: {
        wide: {
          paper: 'a4',
          orientation: 'landscape',
          margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
        },
      },
    },
  })

  expect(printedFromDocument(document).printedPages?.sections).toEqual([
    { id: 'cover', pages: [{ html: '<h2>Cover one</h2><h2>Cover two</h2>' }] },
    { id: 'text', pageGeometry: 'wide', html: '<p>Text</p>' },
    { id: 'answer', pages: [{ html: '<p>Answer</p>' }] },
  ])
})

test('refuses an unknown printed page geometry by section and name', () => {
  expect(() =>
    Document.parse({
      type: 'document',
      kind: 'printed',
      print: { paper: 'a4' },
      parentPages: [{ type: 'parentPage', name: 'body' }],
      parentRules: [{ parent: 'body' }],
      children: [{ type: 'section', id: 'answer', pageGeometry: 'missing', children: [{ type: 'page', body: { html: '<p>Answer</p>' } }] }],
    }),
  ).toThrow(/answer.*unknown page geometry.*missing/)
})
