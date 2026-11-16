import { expect, test } from 'bun:test'
import { BookSection, Chapter } from './book-section.ts'
import { Document } from './document.ts'
import { plainText } from './text-run.ts'

test('plainText preserves strings and joins runs without separators', () => {
  expect(plainText('פרק Genesis')).toBe('פרק Genesis')
  expect(plainText([{ text: 'פרק ' }, { text: 'Genesis', lang: 'en' }])).toBe('פרק Genesis')
})

test('Document reports the run field that could not be parsed', () => {
  const input = (title: unknown) => ({
    type: 'document',
    kind: 'book',
    title: 'Book',
    mode: 'continuous',
    children: [{ type: 'section', title, children: [{ type: 'flow', html: '<p>Text</p>' }] }],
  })
  expect(() => Document.parse(input([]))).toThrow('title cannot be an empty run list')
  expect(() => Document.parse(input([{ text: '' }]))).toThrow('title run text cannot be empty')
  expect(() => Document.parse(input([{ text: 'Chapter', extra: true }]))).toThrow(/title/)
})

test('empty string titles remain valid while title runs remain non-empty', () => {
  expect(Chapter.safeParse({ id: 'chapter', title: '', html: '<p>Text</p>' }).success).toBeTrue()
  expect(BookSection.safeParse({ id: 'section', title: '', html: '<p>Text</p>' }).success).toBeTrue()
})
