import { describe, expect, test } from 'bun:test'
import { Document } from './document.ts'

type Issue = { path: PropertyKey[]; message: string }

function issues(input: unknown): Issue[] {
  const result = Document.safeParse(input)
  expect(result.success).toBe(false)
  if (result.success) return []
  return (result.error as { issues: Issue[] }).issues
}

const flow = { type: 'flow', title: 'Body', html: '<p>Body</p>' } as const
const book = (overrides: Record<string, unknown> = {}) => ({
  type: 'document',
  kind: 'book',
  title: 'Book',
  mode: 'continuous',
  children: [flow],
  ...overrides,
})

describe('lowered document checks', () => {
  test('maps a printed parent basedOn refusal to the document parent page', () => {
    expect(
      issues({
        type: 'document',
        kind: 'printed',
        print: { paper: 'a4' },
        parentPages: [{ type: 'parentPage', name: 'body', basedOn: 'missing' }],
        parentRules: [{ parent: 'body' }],
        children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
      }),
    ).toContainEqual(expect.objectContaining({ path: ['parentPages', 0, 'basedOn'], message: expect.stringContaining('unknown parent page "missing"') }))
  })

  test('maps an unknown book parentRules parent to the document rule', () => {
    expect(issues(book({ parentRules: [{ parent: 'missing' }] }))).toContainEqual(
      expect.objectContaining({ path: ['parentRules', 0, 'parent'], message: expect.stringContaining('unknown parent page "missing"') }),
    )
  })

  test('maps a body contents refusal to its document node', () => {
    expect(issues(book({ children: [{ type: 'contents', title: 'Contents' }] }))).toContainEqual(
      expect.objectContaining({ path: ['children', 0], message: expect.stringContaining('contents belongs in frontMatter') }),
    )
  })

  test('maps a part-depth refusal to the nested document part', () => {
    const section = { type: 'section', children: [flow] }
    const nested = (name: string, children: unknown[]) => ({ type: 'part', name, children })
    const children = [nested('one', [nested('two', [nested('three', [nested('four', [nested('five', [nested('six', [nested('seven', [section])])])])])])])]
    expect(issues(book({ children }))).toContainEqual(
      expect.objectContaining({
        path: ['children', 0, 'children', 0, 'children', 0, 'children', 0, 'children', 0, 'children', 0, 'children', 0],
        message: expect.stringContaining('exceeds the maximum part depth'),
      }),
    )
  })

  test('maps a paginated book without a page to the document page field', () => {
    expect(issues(book({ mode: 'paginated' }))).toContainEqual(
      expect.objectContaining({ path: ['page'], message: 'a paginated book needs page; set page or use continuous mode' }),
    )
  })

  test('reports section numbering and opens policies once each', () => {
    const untitledFlow = { type: 'flow', html: '<p>Body</p>' }
    const numbering = issues(
      book({
        children: [{ type: 'section', title: 'Numbered', numbering: { restart: 2 }, children: [untitledFlow] }],
      }),
    ).filter((issue) => issue.message.includes('use the paginated layout'))
    expect(numbering).toHaveLength(1)

    const opens = issues(book({ children: [{ type: 'section', title: 'Opening', opens: 'continue', children: [untitledFlow] }] })).filter((issue) =>
      issue.message.includes('use another opens value to clear this refusal'),
    )
    expect(opens).toHaveLength(1)
  })

  test('keeps valid book and printed documents parseable', () => {
    expect(Document.parse(book()).kind).toBe('book')
    expect(
      Document.parse({
        type: 'document',
        kind: 'printed',
        print: { paper: 'a4' },
        parentPages: [{ type: 'parentPage', name: 'body' }],
        parentRules: [{ parent: 'body' }],
        children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
      }).kind,
    ).toBe('printed')
  })
})
