import { expect, test } from 'bun:test'
import { parseDocument } from './document.ts'
import { editDocument } from './edit-document.ts'

function oneSectionPart() {
  return parseDocument({
    type: 'document',
    id: 'book',
    kind: 'book',
    metadata: { title: 'Book' },
    mode: 'continuous',
    children: [
      {
        type: 'part',
        id: 'part',
        name: 'Part',
        children: [{ type: 'section', id: 'section', title: 'Section', children: [{ type: 'flow', id: 'flow', html: '' }] }],
      },
      { type: 'section', id: 'target', title: 'Target', children: [{ type: 'flow', id: 'target-flow', html: '' }] },
    ],
  })
}

test('refuses removing the only section from a part', () => {
  const result = editDocument(oneSectionPart(), [{ type: 'remove', node: { id: 'section' } }])
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.refusal).toContain('has no section')
})

test('refuses moving the only section out of a part', () => {
  const result = editDocument(oneSectionPart(), [{ type: 'move', node: { id: 'section' }, to: { parent: { id: 'book' }, index: 2 } }])
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.refusal).toContain('has no section')
})
