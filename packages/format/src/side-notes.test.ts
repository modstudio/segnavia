import { expect, test } from 'bun:test'
import { Document } from './document.ts'

test('defaults side notes to the outer margin and refuses a text area', () => {
  const input = {
    type: 'document',
    kind: 'book',
    title: 'Book',
    mode: 'continuous',
    settings: { sideNotes: {} },
    children: [{ type: 'section', title: 'Section', children: [{ type: 'flow', html: '<p>Body</p>' }] }],
  }
  expect(Document.parse(input).settings?.sideNotes).toEqual({ area: 'margin', side: 'outer' })
  expect(() => Document.parse({ ...input, settings: { sideNotes: { area: 'text' } } })).toThrow('sideNotes.area must be margin')
})
