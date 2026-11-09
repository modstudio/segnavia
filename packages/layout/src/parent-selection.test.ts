import { describe, expect, test } from 'bun:test'
import {
  DESIGNED_PARENT_RULES,
  defaultParentRules,
  FLOWING_PARENT_RULES,
  finalParentSelections,
  finishedPlanParents,
  selectParent,
  TEMPLATED_PARENT_RULES,
} from './parent-selection.ts'

const facts = {
  documentFirst: false,
  documentLast: false,
  sectionFirst: false,
  sectionLast: false,
  face: 'recto' as const,
  blank: false,
}

describe('selectParent', () => {
  test('dispatches each flow kind to its default rule list', () => {
    expect(defaultParentRules('chapter')).toBe(FLOWING_PARENT_RULES)
    expect(defaultParentRules('fixed', 'body')).toBe(TEMPLATED_PARENT_RULES)
    expect(defaultParentRules('fixed')).toBe(DESIGNED_PARENT_RULES)
  })

  test('book defaults preserve blank, fixed, opener and face precedence', () => {
    expect(selectParent(FLOWING_PARENT_RULES, { ...facts, blank: true, sectionFirst: true })).toBe('segnavia:blank')
    expect(selectParent(DESIGNED_PARENT_RULES, facts)).toBe('segnavia:blank')
    expect(selectParent(FLOWING_PARENT_RULES, { ...facts, sectionFirst: true })).toBe('segnavia:opener')
    expect(selectParent(FLOWING_PARENT_RULES, { ...facts, face: 'verso' })).toBe('segnavia:verso')
    expect(selectParent(TEMPLATED_PARENT_RULES, { ...facts, sectionFirst: true })).toBe('segnavia:recto')
  })

  test('printed rules preserve first, last, face and default precedence', () => {
    const rules = [
      { when: { position: 'documentFirst' as const }, parent: 'first' },
      { when: { position: 'documentLast' as const }, parent: 'last' },
      { when: { face: 'recto' as const }, parent: 'face' },
      { parent: 'default' },
    ]
    expect(selectParent(rules, { ...facts, documentFirst: true, documentLast: true })).toBe('first')
    expect(selectParent(rules, { ...facts, documentLast: true })).toBe('last')
    expect(selectParent(rules, facts)).toBe('face')
    expect(selectParent(rules, { ...facts, face: 'verso' })).toBe('default')
  })

  test('a record first page matches sectionFirst and first match wins', () => {
    const rules = [
      { when: { position: 'sectionFirst' as const }, parent: 'letterhead' },
      { when: { face: 'recto' as const }, parent: 'recto' },
      { parent: 'body' },
    ]
    expect(selectParent(rules, { ...facts, sectionFirst: true })).toBe('letterhead')
  })

  test('refuses a text-area change in the finished-page pass', () => {
    expect(() =>
      finalParentSelections(
        [{ parent: 'body', rules: [{ when: { position: 'documentLast' }, parent: 'last' }, { parent: 'body' }], facts, sectionLast: true }],
        [{ body: { width: 100, height: 200 }, last: { width: 100, height: 180 } }],
      ),
    ).toThrow('page 1 changes from parent "body" to "last"')
  })

  test('refuses a missing text area separately from a parent change', () => {
    expect(() => finalParentSelections([{ parent: 'body', rules: [{ parent: 'body' }], facts, sectionLast: true }], [{}])).toThrow(
      'could not establish a text area for parent "body" before the finished-page pass; define that parent\'s text area',
    )
    expect(() =>
      finalParentSelections(
        [{ parent: 'body', rules: [{ when: { position: 'documentLast' }, parent: 'last' }, { parent: 'body' }], facts, sectionLast: true }],
        [{ body: { width: 100, height: 200 } }],
      ),
    ).toThrow('could not establish a text area for parent "last" after the finished-page pass; define that parent\'s text area')
  })

  test('an opening blank does not consume a templated holder rule', () => {
    const area = { width: 100, height: 200 }
    expect(
      finishedPlanParents(
        [
          { flow: 'held', parent: 'segnavia:blank', face: 'verso', blank: true, sectionOpening: false, role: 'blank' },
          { flow: 'held', parent: 'A', face: 'recto', blank: false, sectionOpening: true, role: 'body' },
          { flow: 'held', parent: 'B', face: 'verso', blank: false, sectionOpening: false, role: 'body' },
        ],
        [{ id: 'held', kind: 'fixed', role: 'body', pageParentRules: [[{ parent: 'A' }], [{ parent: 'B' }]] }],
        { 'segnavia:blank': area, A: area, B: area, 'segnavia:recto': area, 'segnavia:verso': area },
      ),
    ).toEqual(['segnavia:blank', 'A', 'B'])
  })
})
