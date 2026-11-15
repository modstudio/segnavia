import { expect, test } from 'bun:test'
import { z } from 'zod'
import { Document } from './document.ts'
import { bookFromDocument } from './document-lowering.ts'

function issues(result: ReturnType<typeof Document.safeParse>): z.core.$ZodIssue[] {
  expect(result.success).toBeFalse()
  if (result.success || !(result.error instanceof z.ZodError)) throw new Error('expected Document parsing to return a ZodError')
  return result.error.issues
}

test('refuses a chapter number on a printed section with the printed remedy', () => {
  expect(() =>
    Document.parse({
      type: 'document',
      kind: 'printed',
      parentPages: [{ type: 'parentPage', name: 'body' }],
      parentRules: [{ parent: 'body' }],
      children: [{ type: 'section', number: 3, children: [{ type: 'flow', html: '<p>Text</p>' }] }],
    }),
  ).toThrow('section field number is not allowed in a printed document; remove it because a printed document has no chapters')
})

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
  expect(issues(result)).toContainEqual(
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
  expect(issues(chapter)).toContainEqual(
    expect.objectContaining({ path: ['children', 0, 'number'], message: expect.stringContaining('roman-lower maximum 3999') }),
  )

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
  expect(issues(restart)).toContainEqual(
    expect.objectContaining({ path: ['children', 0, 'numbering', 'chapters', 'restart'], message: expect.stringContaining('hebrew maximum 9999') }),
  )
})
