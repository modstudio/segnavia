import { expect, test } from 'bun:test'
import { Book } from './book.ts'
import { identifiedBookInput } from './book-test-helper.ts'

const page = { paper: 'a5' as const, margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } }
const input = (overrides: Record<string, unknown>) => identifiedBookInput({ title: 'Book', mode: 'paginated', page, chapters: undefined, ...overrides })

test('an untitled nested section uses its full path in a parent refusal', () => {
  const result = Book.safeParse(
    input({ body: [{ name: 'part', children: [{ kind: 'designed', parentRules: [{ parent: 'missing' }], pages: [{ html: '<p>Art</p>' }] }] }] }),
  )
  expect(result.error?.issues[0]?.message).toContain('section body.0.children.0')
})

test('a nested flow-width refusal reports the section full tree path', () => {
  const result = Book.safeParse(
    input({
      parentPages: [{ name: 'narrow', basedOn: 'segnavia:recto', margin: { blockStart: 10, blockEnd: 10, inlineStart: 30, inlineEnd: 10 } }],
      body: [
        {
          name: 'part',
          children: [
            {
              title: 'Nested',
              html: '<p>Text</p>',
              parentRules: [{ when: { face: 'verso' }, parent: 'narrow' }, { parent: 'segnavia:recto' }],
            },
          ],
        },
      ],
    }),
  )
  expect(result.error?.issues.find((issue) => issue.message.includes('different text widths'))?.path).toEqual(['body', 0, 'children', 0])
})

test('a blank-only parent may have a different text width', () => {
  expect(() =>
    Book.parse(
      input({
        parentPages: [{ name: 'blank-wide', basedOn: 'segnavia:blank', margin: { blockStart: 10, blockEnd: 10, inlineStart: 5, inlineEnd: 5 } }],
        body: [
          {
            title: 'One',
            html: '<p>Text</p>',
            parentRules: [{ when: { blank: true }, parent: 'blank-wide' }, { parent: 'segnavia:recto' }],
          },
        ],
      }),
    ),
  ).not.toThrow()
})

test('refuses renamed parents fields on a section, part and template', () => {
  for (const stale of [
    { chapters: [{ title: 'One', html: '<p>Text</p>', parents: { recto: 'segnavia:recto' } }] },
    { body: [{ id: 'part', name: 'part', html: '<p>Part</p>', parents: { recto: 'segnavia:recto' }, children: [] }] },
    { templates: [{ name: 'page', html: '<main></main>', parents: { recto: 'segnavia:recto' } }] },
  ]) {
    expect(() => Book.parse(input(stale))).toThrow('use parentRules instead to clear this refusal')
  }
})
