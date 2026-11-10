import { expect, test } from 'bun:test'
import { textVariableValue } from './variable-value.ts'

test('part-title variables ignore inherited names (mutation: unchecked property lookup)', () => {
  const variable = { name: 'part', kind: 'text' as const, from: 'part-title' as const, part: 'constructor', pick: 'first' as const }
  expect(textVariableValue(variable, { numberingTotal: '', documentTotal: '', partTitles: {} })).toBe('')
})
