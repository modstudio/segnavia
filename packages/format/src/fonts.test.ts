import { describe, expect, test } from 'bun:test'
import { FontReference, FontReferenceInput } from './fonts.ts'
import { Book, Page } from './index.ts'

describe('FontReference', () => {
  test('reads stored references tolerantly and writes them strictly', () => {
    expect(FontReference.parse({ app: 'body', future: true })).toEqual({ app: 'body' })
    expect(FontReference.parse({ local: 'Arial', fallback: 'body', future: true })).toEqual({ local: 'Arial', fallback: 'body' })
    expect(() => FontReferenceInput.parse({ app: 'body', future: true })).toThrow()
  })

  test('restricts app names to lowercase letters, digits and hyphens', () => {
    expect(FontReference.safeParse({ app: 'Body' }).success).toBe(false)
    expect(FontReference.safeParse({ local: 'Arial', fallback: 'Serif' }).success).toBe(false)
    expect(FontReference.parse({ app: 'adanim-serif' })).toEqual({ app: 'adanim-serif' })
  })
})

describe('Page and Book fonts', () => {
  test('carry optional font references', () => {
    expect(Page.parse({ html: '' }).fonts).toBeUndefined()
    expect(Page.parse({ html: '', fonts: [{ app: 'serif' }] }).fonts).toEqual([{ app: 'serif' }])
    expect(Book.parse({ title: 'Book', mode: 'continuous', chapters: [{ title: 'One', html: '<p>Text</p>' }], fonts: [{ app: 'serif' }] }).fonts).toEqual([
      { app: 'serif' },
    ])
  })
})
