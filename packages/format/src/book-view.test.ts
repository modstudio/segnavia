import { describe, expect, test } from 'bun:test'
import { BookView, jsonSchemas } from './index.ts'

describe('book view', () => {
  test('parses a minimal view with scripts refused', () => {
    expect(BookView.parse({ html: '<main>Book</main>' })).toEqual({ html: '<main>Book</main>', scripts: 'refuse' })
  })

  test('parses all book metadata', () => {
    expect(BookView.parse({ html: '<main>ספר</main>', title: 'ספר', dir: 'rtl', lang: 'he', scripts: 'sandboxed' })).toEqual({
      html: '<main>ספר</main>',
      title: 'ספר',
      dir: 'rtl',
      lang: 'he',
      scripts: 'sandboxed',
    })
  })

  test('refuses missing HTML and invalid metadata', () => {
    expect(BookView.safeParse({ title: 'Book' }).success).toBe(false)
    expect(BookView.safeParse({ html: 3 }).success).toBe(false)
    expect(BookView.safeParse({ html: '', dir: 'sideways' }).success).toBe(false)
    expect(BookView.safeParse({ html: '', scripts: 'allow' }).success).toBe(false)
  })

  test('exports its unresolved JSON Schema', () => {
    const schema = jsonSchemas().bookView as { required?: string[]; properties?: Record<string, unknown> }
    expect(schema.required).toEqual(['html'])
    expect(schema.properties).toHaveProperty('scripts')
  })
})
