import { expect, test } from 'bun:test'
import { pageOrPrintedFromInput } from './document-input.ts'

test('a page render refuses another document kind and names both accepted kinds', () => {
  expect(() => pageOrPrintedFromInput({ type: 'document', kind: 'deck', children: [] })).toThrow(
    'document kind deck is not accepted here; use kind page or printed to clear this refusal',
  )
})
