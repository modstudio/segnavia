import { expect, test } from 'bun:test'
import { Book, type BookInput } from '@segnavia/format'
import { bookDocument } from './book-document.ts'

const input = (chapters: BookInput['chapters']): BookInput => ({ title: 'Book', mode: 'continuous', chapters })

test('fills page references while keeping an empty link before pagination', () => {
  const book = Book.parse(input([{ title: 'One', html: '<p><a href="#topic" data-ref="page"></a></p><h2 id="topic">Topic</h2>' }]))
  expect(bookDocument(book).html).toContain('<a href="#topic" data-ref="page" dir="ltr"></a>')
  expect(bookDocument(book, { pageNumbers: { topic: 'יב' } }).html).toContain('<a href="#topic" data-ref="page" dir="rtl">יב</a>')
  expect(bookDocument(book, { pageNumbers: { topic: '12' }, crossLinks: true }).html).toContain(
    '<a href="segnavia:target/topic" data-ref="page" dir="ltr">12</a>',
  )
})

test('reports missing and ambiguous page reference targets', () => {
  const missing = bookDocument(Book.parse(input([{ title: 'One', html: '<p><a href="#lost" data-ref="page"></a></p>' }])))
  expect(missing.issues).toContain('page reference target lost does not exist; add id="lost" to its destination to clear this refusal')

  const repeated = bookDocument(
    Book.parse(
      input([
        { title: 'One', html: '<p><a href="#topic" data-ref="page"></a><span id="topic">First</span></p>' },
        { title: 'Two', html: '<span id="topic">Second</span>' },
      ]),
    ),
  )
  expect(repeated.issues).toContain(
    'page reference target topic is used in both One (segnavia-chapter-1) and Two (segnavia-chapter-2); make the target id unique to clear this refusal',
  )
})
