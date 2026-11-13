import { expect, test } from 'bun:test'
import { defaultParentRules, effectiveParentRules } from './parent-rules.ts'

test('designed pages use section, book, then blank parent rules', () => {
  const sectionRules = [{ parent: 'section' }]
  const bookRules = [{ parent: 'book' }]
  const designedDefaults = defaultParentRules('fixed')

  expect(effectiveParentRules(sectionRules, bookRules, designedDefaults)).toBe(sectionRules)
  expect(effectiveParentRules(undefined, bookRules, designedDefaults)).toBe(bookRules)
  expect(effectiveParentRules(undefined, undefined, designedDefaults)).toEqual([{ parent: 'segnavia:blank' }])
})
