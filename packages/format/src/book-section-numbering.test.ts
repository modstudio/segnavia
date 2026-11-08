import { expect, test } from 'bun:test'
import { Book } from './book.ts'
import { identifiedBookInput } from './book-test-helper.ts'

const chapter = { title: 'Chapter', html: '<p>Text</p>' }
const page = { paper: 'a5' as const, margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } }

test('refuses section numbering at the Book edge when the mode or number system cannot apply it', () => {
  expect(() => Book.parse(identifiedBookInput({ title: 'Book', mode: 'continuous', chapters: [{ ...chapter, numbering: { restart: 4 } }] }))).toThrow(
    /use the paginated layout.*clear this refusal/,
  )
  expect(() =>
    Book.parse(
      identifiedBookInput({
        title: 'Book',
        mode: 'paginated',
        page,
        numbering: { body: 'roman-lower' },
        chapters: [{ ...chapter, numbering: { restart: 4000 } }],
      }),
    ),
  ).toThrow('roman-lower range 1 to 3999')
})
