import { expect, test } from 'bun:test'
import { deterministicNewId } from './deterministic-id.ts'

test('mints repeatable ids while skipping nested node and block ids', () => {
  const input = {
    id: 'document',
    children: [
      { id: 'document-1' },
      {
        body: {
          html: `<p data-segnavia-id="document-2">Two</p><p data-segnavia-id='document-4'>Four</p><p data-segnavia-id=document-5>Five</p>`,
        },
      },
    ],
  }
  const first = deterministicNewId(input)
  const second = deterministicNewId(input)

  expect([first(), first(), first(), first()]).toEqual(['document-3', 'document-6', 'document-7', 'document-8'])
  expect([second(), second(), second(), second()]).toEqual(['document-3', 'document-6', 'document-7', 'document-8'])
})

test('collects ids once when the helper is created', () => {
  const input = { id: 'document', children: [] as Array<{ id: string }> }
  const newId = deterministicNewId(input)
  input.children.push({ id: 'document-1' })

  expect(newId()).toBe('document-1')
  expect(newId()).toBe('document-2')
})

test('refuses inputs without a non-empty document id and names the remedy', () => {
  const inputs = [undefined, null, 'document', [], {}, { id: '' }, { id: 1 }]
  for (const input of inputs) {
    expect(() => deterministicNewId(input)).toThrow(/needs the document's id.*give the document a non-empty id to clear this refusal/)
  }
})
