import { expect, test } from 'bun:test'
import type { ZodError } from 'zod'
import { Document } from './document.ts'

test('slotless templates name the record values and slots that clear the refusal', () => {
  const result = Document.safeParse({
    type: 'document',
    kind: 'printed',
    parentRules: [{ parent: 'body' }],
    parentPages: [{ type: 'parentPage', name: 'body' }],
    templates: [{ type: 'template', name: 'row', html: '<p></p>' }],
    children: [{ type: 'record', id: 'entry', template: 'row', values: { name: 'Ada', role: 'Editor' } }],
  })
  if (result.success) throw new Error('expected the slotless record template to be refused')
  expect((result.error as ZodError).issues[0]?.message).toBe(
    'template row has no slots, so record entry\'s values "name", "role" cannot be placed; declare slots "name", "role" on template row to clear this refusal',
  )
})
