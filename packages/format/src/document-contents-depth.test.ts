import { expect, test } from 'bun:test'
import { Document } from './document.ts'
import { bookFromDocument } from './document-lowering.ts'

test('renames the contents depth and carries section caps into book entries', () => {
  const input = {
    type: 'document' as const,
    kind: 'book' as const,
    title: 'Book',
    mode: 'continuous' as const,
    children: [
      { type: 'division' as const, name: 'front' as const, children: [{ type: 'contents' as const, contentsDepth: 3 }] },
      {
        type: 'division' as const,
        name: 'body' as const,
        children: [
          {
            type: 'section' as const,
            id: 'chapter',
            title: 'Chapter',
            contentsDepth: 1,
            children: [{ type: 'flow' as const, html: '<p>Text</p>' }],
          },
        ],
      },
    ],
  }
  const book = bookFromDocument(Document.parse(input))
  expect(book.contents.depth).toBe(3)
  expect(book.body[0]).toMatchObject({ id: 'chapter', contentsDepth: 1 })
  expect(bookFromDocument(Document.parse({ ...input, children: input.children.slice(1) })).contents.depth).toBe(2)
})

test('bounds both contentsDepth fields and refuses the renamed contents depth', () => {
  const root = { type: 'document' as const, kind: 'book' as const, title: 'Book', mode: 'continuous' as const }
  for (const contentsDepth of [0, 7]) {
    expect(() => Document.parse({ ...root, children: [{ type: 'contents', contentsDepth }] })).toThrow()
    expect(() =>
      Document.parse({
        ...root,
        children: [{ type: 'section', title: 'Chapter', contentsDepth, children: [{ type: 'flow', html: '<p>Text</p>' }] }],
      }),
    ).toThrow()
  }
  expect(() => Document.parse({ ...root, children: [{ type: 'contents', depth: 3 }] })).toThrow(/depth.*rename it to contentsDepth/)
  expect(() => Document.parse({ ...root, children: [{ type: 'contents', depth: 3, extra: 1 }] })).toThrow(
    /rename \\?"depth\\?" to contentsDepth and remove \\?"extra\\?"/,
  )
})

test('refuses a contents depth cap on printed sections with the printed remedy', () => {
  expect(() =>
    Document.parse({
      type: 'document',
      kind: 'printed',
      parentPages: [{ type: 'parentPage', name: 'body' }],
      parentRules: [{ parent: 'body' }],
      children: [{ type: 'section', contentsDepth: 1, children: [{ type: 'flow', html: '<p>Text</p>' }] }],
    }),
  ).toThrow('section field contentsDepth is not allowed in a printed document; remove it because a printed document has no contents')
})
