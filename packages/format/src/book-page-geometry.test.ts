import { describe, expect, test } from 'bun:test'
import { identifiedBookInput } from './book-test-helper.ts'
import { Book } from './index.ts'

const chapter = { title: 'Chapter', html: '<p>Text</p>' }
const page = { paper: 'a5' as const, margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } }
const input = (overrides: Record<string, unknown> = {}) => identifiedBookInput({ title: 'Book', mode: 'continuous', chapters: [chapter], ...overrides })

describe('book page geometry', () => {
  test('resolves a named page geometry on every section kind', () => {
    const style = {
      pageGeometries: {
        wide: {
          paper: 'letter' as const,
          orientation: 'landscape' as const,
          margin: { blockStart: 12, blockEnd: 12, inlineStart: 14, inlineEnd: 14 },
          columns: { count: 2, gap: 6 },
        },
      },
    }
    const body = [
      { title: 'Flow', html: '<p>Text</p>', pageGeometry: 'wide' },
      { kind: 'designed' as const, title: 'Design', pages: [{ html: '<p>Art</p>' }], pageGeometry: 'wide' },
      { kind: 'templated' as const, title: 'Template', template: 'plate', pages: [{ regions: {} }], pageGeometry: 'wide' },
      { kind: 'placed' as const, title: 'Placed', placement: { kind: 'page' as const, address: 'page/one' }, pageGeometry: 'wide' },
    ]
    const book = Book.parse(input({ mode: 'paginated', page, style, templates: [{ name: 'plate', html: '<main></main>' }], chapters: undefined, body }))
    expect(book.body.map((entry) => ('pageGeometry' in entry ? entry.pageGeometry : undefined))).toEqual(['wide', 'wide', 'wide', 'wide'])
  })

  test('refuses an unknown section geometry with both clearances', () => {
    const result = Book.safeParse(input({ mode: 'paginated', page, chapters: [{ ...chapter, pageGeometry: 'missing' }] }))
    expect(result.error?.issues[0]?.path).toEqual(['chapters', 0, 'pageGeometry'])
    expect(result.error?.issues[0]?.message).toContain('declare it in style.pageGeometries, or remove pageGeometry')
  })

  test('refuses a section geometry in a continuous book', () => {
    const result = Book.safeParse(
      input({
        style: {
          pageGeometries: { wide: { paper: 'letter', orientation: 'landscape', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } } },
        },
        chapters: [{ ...chapter, pageGeometry: 'wide' }],
      }),
    )
    expect(result.error?.issues[0]?.message).toContain('use paginated layout, or remove pageGeometry')
  })

  test('refuses a named parent whose text area does not fit its section paper', () => {
    const result = Book.safeParse(
      input({
        mode: 'paginated',
        page,
        style: {
          pageGeometries: { wide: { paper: 'letter', orientation: 'landscape', margin: { blockStart: 10, blockEnd: 10, inlineStart: 20, inlineEnd: 20 } } },
        },
        parentPages: [{ name: 'narrow', margin: { blockStart: 10, blockEnd: 10, inlineStart: 150, inlineEnd: 150 } }],
        chapters: [{ ...chapter, pageGeometry: 'wide', parents: { recto: 'narrow' } }],
      }),
    )
    const issue = result.error?.issues.find((candidate) => candidate.message.includes('does not fit'))
    expect(issue?.path).toEqual(['chapters', 0])
    expect(issue?.message).toContain('narrow')
    expect(issue?.message).toContain('279.4mm by 215.9mm paper')
  })
})
