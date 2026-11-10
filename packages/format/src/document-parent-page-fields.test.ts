import { expect, test } from 'bun:test'
import { Document } from './document.ts'

test.each([
  ['head', 'blockStart'],
  ['foot', 'blockEnd'],
] as const)('refuses the removed Document parent-page %s field with its regions remedy', (field, edge) => {
  const value = {
    type: 'document',
    kind: 'book',
    title: 'Regions',
    mode: 'continuous',
    children: [],
    parentPages: [{ type: 'parentPage', name: 'body', [field]: '<div>Furniture</div>' }],
  }
  expect(() => Document.parse(value)).toThrow(`use regions with a ${field} (${edge}) region`)
})
