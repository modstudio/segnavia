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
