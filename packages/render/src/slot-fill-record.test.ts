import { expect, test } from 'bun:test'
import { Book } from '@segnavia/format'
import { bookDocument } from '@segnavia/html'
import { filledBook } from './slot-fill.ts'

test('filledBook accepts a record-template slot used by entry HTML without host slot work', async () => {
  const book = Book.parse({
    title: 'Records',
    mode: 'continuous',
    body: [
      {
        id: 'one',
        title: 'One',
        html: '<p data-slot-value="name">Authored name</p>',
        values: { name: 'Ada' },
        record: { index: 1, count: 1 },
        recordTemplate: { name: 'row', slots: [{ key: 'name', label: 'Name', type: 'text' }] },
      },
    ],
  })

  const { value } = await filledBook(book, undefined)
  expect(() => bookDocument(value)).not.toThrow()
})

test('filledBook accepts a record-template slot used by template HTML', async () => {
  const book = Book.parse({
    title: 'Records',
    mode: 'continuous',
    templates: [{ name: 'row', html: '<p data-slot-value="name">Authored name</p>', slots: [{ key: 'name', label: 'Name', type: 'text' }] }],
    body: [{ id: 'one', title: 'One', html: '<p>Body</p>' }],
  })

  await expect(filledBook(book, undefined)).resolves.toBeDefined()
})
