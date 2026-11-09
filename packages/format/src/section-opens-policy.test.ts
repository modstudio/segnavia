import { expect, test } from 'bun:test'
import { type SectionOpensFact, sectionOpensIssues } from './section-opens-policy.ts'
import type { ResolvedBookPageGeometry } from './book-page-geometry.ts'

const section = (overrides: Partial<SectionOpensFact> = {}): SectionOpensFact => ({
  id: 'two',
  title: 'Two',
  path: ['body', 1],
  sequence: 'body',
  flowing: true,
  opens: 'continue',
  ...overrides,
})

test('refuses continue at the start of every division or part sequence', () => {
  expect(sectionOpensIssues([section()])[0]?.message).toContain('use another opens value to clear this refusal')
  expect(sectionOpensIssues([section({ sequence: 'part-a' })])[0]?.path).toEqual(['body', 1, 'opens'])
})

test('refuses continue when either adjacent section is not flowing', () => {
  const first = section({ id: 'one', opens: 'any', path: ['body', 0] })
  expect(sectionOpensIssues([first, section({ flowing: false })])[0]?.message).toContain('has no flow to join')
  expect(sectionOpensIssues([{ ...first, flowing: false }, section()])[0]?.message).toContain('has no flow to join')
})

test('refuses continue with numbering and parents by the fields that clear it', () => {
  const issues = sectionOpensIssues([
    section({ id: 'one', opens: 'any', path: ['body', 0] }),
    section({ numbering: { counted: false }, parents: { opener: 'chapter' } }),
  ])
  expect(issues.map((issue) => issue.path.at(-1))).toEqual(['numbering', 'parents'])
  expect(issues.map((issue) => issue.message)).toEqual([
    expect.stringContaining('remove numbering or use another opens value'),
    expect.stringContaining('remove parents or use another opens value'),
  ])
})

test('accepts continue between adjacent flowing sections in one sequence', () => {
  expect(sectionOpensIssues([section({ id: 'one', opens: 'any', path: ['body', 0] }), section()])).toEqual([])
})

test('refuses continue when adjacent resolved geometries differ', () => {
  const geometry = (name: string, width: number): ResolvedBookPageGeometry => ({
    name,
    paper: { width, height: 279.4 },
    margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
    columns: { count: 1, gap: 4 },
  })
  const issues = sectionOpensIssues([
    section({ id: 'one', opens: 'any', path: ['body', 0], geometry: geometry('portrait', 215.9) }),
    section({ geometry: geometry('landscape', 279.4) }),
  ])
  expect(issues[0]?.path).toEqual(['body', 1, 'opens'])
  expect(issues[0]?.message).toContain('use the same geometry, or another opens value to clear this refusal')
})

test('accepts differently named geometries that resolve identically', () => {
  const base: ResolvedBookPageGeometry = {
    name: 'one',
    paper: { width: 215.9, height: 279.4 },
    margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
    columns: { count: 1, gap: 4 },
  }
  expect(
    sectionOpensIssues([
      section({ id: 'one', opens: 'any', path: ['body', 0], geometry: base }),
      section({ geometry: { ...base, name: 'two' } }),
    ]),
  ).toEqual([])
})
