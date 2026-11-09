import { expect, test } from 'bun:test'
import { pageFace, selectParent } from '@segnavia/layout'
import { applyPrintedParentRules } from './printed-parent-selection.ts'

test('printed sections select with document, section, face and blank facts', () => {
  const plan = {
    pages: [
      { flow: 'a', parent: 'body', face: 'recto' as const, side: 'right' as const, blank: false },
      { flow: 'a', parent: 'body', face: 'recto' as const, side: 'right' as const, blank: false },
      { flow: 'a', parent: 'body', face: 'recto' as const, side: 'right' as const, blank: false },
      { flow: 'b', parent: 'body', face: 'recto' as const, side: 'right' as const, blank: false },
      { flow: 'b', parent: 'body', face: 'recto' as const, side: 'right' as const, blank: true },
      { flow: 'b', parent: 'body', face: 'recto' as const, side: 'right' as const, blank: false },
      { flow: 'b', parent: 'body', face: 'recto' as const, side: 'right' as const, blank: false },
    ],
  }
  const sectionRules = [
    { when: { position: 'documentFirst' as const }, parent: 'first' },
    { when: { position: 'sectionLast' as const }, parent: 'closing' },
    { when: { face: 'verso' as const }, parent: 'verso' },
    { parent: 'body' },
  ]
  const documentRules = [
    { when: { position: 'documentLast' as const }, parent: 'last' },
    { when: { position: 'sectionFirst' as const }, parent: 'opening' },
    { when: { blank: true }, parent: 'blank' },
    { when: { face: 'verso' as const }, parent: 'verso' },
    { parent: 'body' },
  ]
  applyPrintedParentRules(plan, { a: sectionRules }, documentRules, 'ltr', pageFace, selectParent)
  expect(plan.pages.map((page) => page.parent)).toEqual(['first', 'verso', 'closing', 'opening', 'blank', 'verso', 'last'])
})
