import { expect, test } from 'bun:test'
import { Document, printedFromDocument } from '@segnavia/format'
import { bindRecordValues } from './record-values.ts'

const section = {
  html: '<p data-slot-value="name"></p>',
  values: { name: 'שָׁלוֹם' },
  recordTemplate: { name: 'row', slots: [{ key: 'name' }] },
}

test('keeps a Hebrew record value through lowering and binds it with automatic direction', () => {
  const lowered = printedFromDocument(
    Document.parse({
      type: 'document',
      kind: 'printed',
      print: { paper: 'letter' },
      parentRules: [{ parent: 'body' }],
      parentPages: [{ type: 'parentPage', name: 'body' }],
      templates: [{ type: 'template', name: 'row', html: section.html, slots: [{ key: 'name', label: 'Name', type: 'text' }] }],
      children: [{ type: 'record', template: 'row', values: section.values }],
    }),
  ).printedPages?.sections?.[0]
  expect(lowered?.values).toEqual({ name: 'שָׁלוֹם' })
  expect(bindRecordValues(lowered as NonNullable<typeof lowered>).html).toBe('<p dir="auto">שָׁלוֹם</p>')
})

test('refuses a declared template slot that its HTML never binds', () => {
  expect(() => bindRecordValues({ ...section, html: '<p></p>' })).toThrow('never binds it')
})
