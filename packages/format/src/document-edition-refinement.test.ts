import { expect, test } from 'bun:test'
import { Document } from './document.ts'

test('requires a default edition when conditions are declared', () => {
  expect(() =>
    Document.parse({
      type: 'document',
      kind: 'page',
      children: [{ type: 'page', body: { html: '' } }],
      conditions: [{ type: 'condition', name: 'edition' }],
    }),
  ).toThrow('conditions need a defaultEdition; declare defaultEdition to clear this refusal')
})

test('validates condition and edition names and references', () => {
  const valid = {
    type: 'document' as const,
    kind: 'page' as const,
    children: [{ type: 'page' as const, body: { html: '' } }],
    conditions: [{ type: 'condition' as const, name: 'student' }],
    editions: [{ type: 'edition' as const, name: 'student', conditions: ['student'] }],
    defaultEdition: 'student',
  }
  expect(() => Document.parse({ ...valid, children: [{ type: 'page', body: { html: '' }, conditions: ['missing'] }] })).toThrow(
    /page node names unknown condition.*missing/,
  )
  expect(() => Document.parse({ ...valid, editions: [{ type: 'edition', name: 'student', conditions: ['missing'] }] })).toThrow(
    /edition.*student.*names unknown condition.*missing/,
  )
  expect(() => Document.parse({ ...valid, defaultEdition: 'missing' })).toThrow(/defaultEdition names unknown edition.*missing/)
  expect(() => Document.parse({ ...valid, conditions: [...valid.conditions, ...valid.conditions] })).toThrow(
    /condition name.*student.*is declared more than once/,
  )
  expect(() => Document.parse({ ...valid, editions: [...valid.editions, ...valid.editions] })).toThrow(/edition name.*student.*is declared more than once/)
})

test.each([
  ['an unknown name', 'missing', 'children[0]: data-segnavia-condition names unknown condition "missing"'],
  ['an empty value', '', 'children[0]: data-segnavia-condition names no condition'],
  ['a whitespace-only value', '   ', 'children[0]: data-segnavia-condition names no condition'],
])('refuses HTML condition markers with %s through Document.parse', (_case, marker, message) => {
  const result = Document.safeParse({
    type: 'document',
    kind: 'page',
    children: [{ type: 'page', body: { html: `<p data-segnavia-condition="${marker}">Hidden</p>` } }],
    conditions: [{ type: 'condition', name: 'student' }],
    editions: [{ type: 'edition', name: 'student', conditions: ['student'] }],
    defaultEdition: 'student',
  })
  expect(result.success).toBeFalse()
  if (!result.success) {
    const error = result.error as { issues: Array<{ message: string }> }
    expect(error.issues.map((issue) => issue.message)).toContainEqual(expect.stringContaining(message))
  }
})

test('reports a duplicate variable name exactly once', () => {
  const result = Document.safeParse({
    type: 'document',
    kind: 'book',
    title: 'Variables',
    mode: 'continuous',
    children: [{ type: 'section', title: 'Section', children: [{ type: 'flow', html: '' }] }],
    variables: [
      { type: 'variable', kind: 'text', name: 'v', from: 'content' },
      { type: 'variable', kind: 'text', name: 'v', from: 'content' },
    ],
  })
  expect(result.success).toBeFalse()
  if (!result.success) {
    const error = result.error as { issues: Array<{ message: string }> }
    expect(error.issues.filter((issue) => issue.message.includes('variable name "v" is declared more than once'))).toHaveLength(1)
  }
})
