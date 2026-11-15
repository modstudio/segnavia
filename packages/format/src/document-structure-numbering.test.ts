import { expect, test } from 'bun:test'
import { Document } from './document.ts'
import { bookFromDocument } from './document-lowering.ts'

test('carries structure numbering fields into book entries', () => {
  const document = Document.parse({
    type: 'document',
    kind: 'book',
    title: 'Book',
    mode: 'continuous',
    numbering: { parts: { style: 'roman-upper' }, chapters: { style: 'arabic' } },
    children: [
      { type: 'section', title: 'Before', children: [{ type: 'flow', html: '<p>Before</p>' }] },
      {
        type: 'part',
        name: 'first',
        title: 'First',
        contentsLabel: 'Part One',
        number: 1,
        numbering: { chapters: { style: 'hebrew', restart: 2 } },
        children: [{ type: 'section', title: 'Chapter', number: 'A', children: [{ type: 'flow', html: '<p>Text</p>' }] }],
      },
    ],
  })
  expect(bookFromDocument(document)).toMatchObject({
    numbering: { parts: { style: 'roman-upper' }, chapters: { style: 'arabic' } },
    body: [
      { title: 'Before' },
      {
        name: 'first',
        contentsLabel: 'Part One',
        number: 1,
        numbering: { chapters: { style: 'hebrew', restart: 2 } },
        children: [{ number: 'A' }],
      },
    ],
  })
})

test('refuses invalid structure numbering with remedies', () => {
  const root = { type: 'document' as const, kind: 'book' as const, title: 'Book', mode: 'continuous' as const }
  for (const restart of [0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => Document.parse({ ...root, children: [{ type: 'part', name: 'one', numbering: { chapters: { restart } }, children: [] }] })).toThrow(
      'restart must be a positive',
    )
  }
  expect(() => Document.parse({ ...root, numbering: { chapters: { style: 'decimal' } }, children: [] })).toThrow('Invalid option: expected one of')
})
