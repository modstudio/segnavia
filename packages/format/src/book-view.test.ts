import { describe, expect, test } from 'bun:test'
import { BookView, jsonSchemas } from './index.ts'

describe('book view', () => {
  test('parses a minimal view with scripts refused', () => {
    expect(BookView.parse({ html: '<main>Book</main>' })).toEqual({ html: '<main>Book</main>', scripts: 'refuse' })
    expect(BookView.parse({ html: '<main class="lead">Book</main>', style: { css: '.lead{color:purple}' } }).style?.css).toBe('.lead{color:purple}')
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
      margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 },
      columnGap: 4,
      geometries: [
        {
          paper: { width: 148, height: 210 },
          margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 },
          columns: { count: 1, gap: 4 },
          parents: [{ name: 'segnavia:recto', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } }],
        },
      ],
      direction: 'rtl' as const,
      numbering: { frontMatter: 'arabic' as const, body: 'hebrew' as const },
      rectoOpenings: true,
      orphans: 2,
      widows: 2,
      parents: [{ name: 'segnavia:recto', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } }],
      endnotePlacement: 'book' as const,
      contents: { pageNumbers: true, depth: 2 },
    }
    const parsed = BookView.parse({ html: '<main>ספר</main>', pagination })
    expect(parsed).toMatchObject({ html: '<main>ספר</main>', pagination })
    expect(parsed.pagination).not.toHaveProperty('fragmentation')
    expect(parsed.pagination?.variables.map((variable) => variable.name)).toContain('segnavia:folio')
    expect(parsed.pagination?.headTemplates.map((template) => template.name)).toEqual(['segnavia:running-head', 'segnavia:folio'])
  })

  test('exports its unresolved JSON Schema', () => {
    const schema = jsonSchemas().bookView as { required?: string[]; properties?: Record<string, unknown> }
    expect(schema.required).toEqual(['html'])
    expect(schema.properties).toHaveProperty('scripts')
    expect(schema.properties).toHaveProperty('pagination')
    expect(schema.properties).toHaveProperty('flow')
  })
})
