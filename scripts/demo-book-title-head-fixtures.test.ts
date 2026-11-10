import { expect, test } from 'bun:test'
import { Document } from '@segnavia/format'
import { titleHeadFixture } from './demo-book-title-head-fixtures.ts'

test.each([
  [false, 'The Book of Tides', 'Beginning'],
  [true, 'ספר ההפלגה', 'התחלה'],
] as const)('declares book and section title heads for the English and Hebrew fixtures', (hebrew, bookTitle, sectionTitle) => {
  const document = Document.parse(titleHeadFixture(hebrew))
  expect(document.metadata?.title).toBe(bookTitle)
  expect(document.children[0]).toMatchObject({ title: sectionTitle })
  expect(document.parentPages.map(({ head }) => head)).toEqual([
    expect.stringContaining('data-motif-name="book-title"'),
    expect.stringContaining('data-motif-name="section-title"'),
  ])
})
