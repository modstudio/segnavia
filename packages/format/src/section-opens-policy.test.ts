import { expect, test } from 'bun:test'
import { type SectionOpensFact, sectionOpensIssues } from './section-opens-policy.ts'

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
