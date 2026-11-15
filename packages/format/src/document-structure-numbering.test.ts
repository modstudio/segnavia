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

test('refuses structure numbers outside the effective style range at parse', () => {
  const root = {
    type: 'document',
    kind: 'book',
    title: 'Book',
    mode: 'continuous',
  } as const
  const result = Document.safeParse({
    ...root,
    numbering: { parts: { style: 'roman-upper' } },
    children: [{ type: 'part', name: 'one', title: 'One', number: 4000, children: [] }],
  })
  expect(result.success).toBeFalse()
  if (result.success) throw new Error('expected the out-of-range structure number to be refused')
  expect(result.error.issues).toContainEqual(
    expect.objectContaining({
      path: ['children', 0, 'number'],
      message: expect.stringContaining('part "One" at body.0 sets number 4000, outside the roman-upper maximum 3999'),
    }),
  )

  const chapter = Document.safeParse({
    ...root,
    numbering: { chapters: { style: 'roman-lower' } },
    children: [{ type: 'section', title: 'Chapter', number: 4000, children: [{ type: 'flow', html: '<p>Text</p>' }] }],
  })
  expect(chapter.success).toBeFalse()
  if (chapter.success) throw new Error('expected the out-of-range chapter number to be refused')
  expect(chapter.error.issues).toContainEqual(expect.objectContaining({ path: ['children', 0, 'number'], message: expect.stringContaining('roman-lower maximum 3999') }))

  const restart = Document.safeParse({
    ...root,
    numbering: { chapters: { style: 'hebrew' } },
    children: [
      {
        type: 'part',
        name: 'one',
        numbering: { chapters: { restart: 10000 } },
        children: [{ type: 'section', title: 'Chapter', children: [{ type: 'flow', html: '<p>Text</p>' }] }],
      },
    ],
  })
  expect(restart.success).toBeFalse()
  if (restart.success) throw new Error('expected the out-of-range restart to be refused')
  expect(restart.error.issues).toContainEqual(
    expect.objectContaining({ path: ['children', 0, 'numbering', 'chapters', 'restart'], message: expect.stringContaining('hebrew maximum 9999') }),
  )
})
