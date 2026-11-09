import { expect, test } from 'bun:test'
import { Document } from './document.ts'
import { printedFromDocument } from './document-lowering.ts'

test('lowers printed sections with their plan fields and keeps Hebrew settings', () => {
  const document = Document.parse({
    type: 'document',
    kind: 'printed',
    settings: { lang: 'he' },
    print: { paper: 'a4' },
    rules: { every: 'body' },
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
