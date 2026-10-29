import { describe, expect, test } from 'bun:test'
import { BookView, jsonSchemas } from './index.ts'

describe('book view', () => {
  test('parses a minimal view with scripts refused', () => {
    expect(BookView.parse({ html: '<main>Book</main>' })).toEqual({ html: '<main>Book</main>', scripts: 'refuse' })
    expect(BookView.parse({ html: '<main class="lead">Book</main>', css: '.lead{color:purple}' }).css).toBe('.lead{color:purple}')
  })

  test('parses all book metadata', () => {
    expect(BookView.parse({ html: '<main>ספר</main>', flow: '<main>זרימה</main>', title: 'ספר', dir: 'rtl', lang: 'he', scripts: 'sandboxed' })).toEqual({
      html: '<main>ספר</main>',
      flow: '<main>זרימה</main>',
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
    const invalidFlow = BookView.safeParse({ html: '', flow: 3 })
    expect(invalidFlow.success).toBe(false)
    if (!invalidFlow.success) expect(invalidFlow.error.issues[0]?.path).toEqual(['flow'])
  })

  test('parses an optional pagination object', () => {
    const pagination = {
      paper: { width: 148, height: 210 },
      margin: { top: 12, bottom: 12, inner: 15, outer: 10 },
      columnGap: 4,
      direction: 'rtl' as const,
      numbering: { frontMatter: 'arabic' as const, body: 'hebrew' as const },
      rectoOpenings: true,
      orphans: 2,
      widows: 2,
      parents: [{ name: 'segnavia:recto', margin: { top: 12, bottom: 12, inner: 15, outer: 10 } }],
      endnotePlacement: 'book' as const,
      contents: { pageNumbers: true, depth: 2 },
      runningHead: { recto: { mark: 'siman', which: 'first' as const }, verso: 'title' as const },
    }
    expect(BookView.parse({ html: '<main>ספר</main>', pagination })).toMatchObject({ html: '<main>ספר</main>', pagination })
  })

  test('exports its unresolved JSON Schema', () => {
    const schema = jsonSchemas().bookView as { required?: string[]; properties?: Record<string, unknown> }
    expect(schema.required).toEqual(['html'])
    expect(schema.properties).toHaveProperty('scripts')
    expect(schema.properties).toHaveProperty('pagination')
    expect(schema.properties).toHaveProperty('flow')
  })
})
