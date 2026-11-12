import { describe, expect, test } from 'bun:test'
import { Book } from './book.ts'
import { identifiedBookInput } from './book-test-helper.ts'

const chapter = { title: 'Chapter', html: '<p>Text</p>' }
const input = (overrides: Record<string, unknown> = {}) => identifiedBookInput({ title: 'Book', mode: 'continuous', chapters: [chapter], ...overrides })

describe('book division numbering', () => {
  test('resolves printing defaults and an explicit unprinted front matter', () => {
    expect(Book.parse(input()).numbering.printed).toEqual({ frontMatter: true, body: true })
    expect(Book.parse(input({ numbering: { printed: { frontMatter: false } } })).numbering.printed).toEqual({ frontMatter: false, body: true })
    expect(Book.safeParse(input({ numbering: { printed: { frontMatter: 'no' } } })).success).toBeFalse()
  })

  test('allows matching division systems only when one does not print', () => {
    const result = Book.safeParse(input({ frontMatter: [{ html: '<nav>Contents</nav>' }], numbering: { frontMatter: 'arabic', body: 'arabic' } }))
    expect(result.error?.issues[0]).toMatchObject({ path: ['numbering'] })
    expect(result.error?.issues[0]?.message).toContain('both arabic')
    expect(result.error?.issues[0]?.message).toContain('must differ')
    expect(result.error?.issues[0]?.message).toContain('numbering.printed.frontMatter')
    expect(
      Book.safeParse(
        input({ frontMatter: [{ html: '<nav>Contents</nav>' }], numbering: { frontMatter: 'arabic', body: 'arabic', printed: { frontMatter: false } } }),
      ).success,
    ).toBeTrue()
  })
})
