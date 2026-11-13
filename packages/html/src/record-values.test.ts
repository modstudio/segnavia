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

test('inserts a record body before binding values across the composed HTML', () => {
  expect(
    bindRecordValues({
      ...section,
      html: '<article><h1>Profile</h1><main data-record-body>Fallback</main></article>',
      recordBody: '<p data-slot-value="name"></p>',
    }).html,
  ).toBe('<article><h1>Profile</h1><main data-record-body dir="rtl"><p dir="auto">שָׁלוֹם</p></main></article>')
})

test('still refuses a declared slot bound in neither the template nor its body', () => {
  expect(() =>
    bindRecordValues({
      ...section,
      html: '<main data-record-body></main>',
      recordBody: '<p>Body</p>',
    }),
  ).toThrow('never binds it')
})

test('leaves a template body point empty when the record has no body', () => {
  expect(
    bindRecordValues({
      html: '<article><main data-record-body><p>Fallback</p></main></article>',
      recordTemplate: { name: 'row', slots: [] },
    }).html,
  ).toBe('<article><main data-record-body></main></article>')
})

test('keeps a composed body when record binding is applied again', () => {
  const once = bindRecordValues({
    ...section,
    html: '<main data-record-body></main>',
    recordBody: '<p data-slot-value="name"></p>',
  })
  expect(bindRecordValues(once).html).toBe(once.html)
})

test.each(['ltr', 'rtl'])('gives a Hebrew record body its resolved direction inside an %s template', (templateDirection) => {
  expect(
    bindRecordValues({
      html: `<article dir="${templateDirection}"><main data-record-body></main></article>`,
      recordTemplate: { name: 'row', slots: [] },
      recordBody: '<p>שָׁלוֹם</p>',
    }).html,
  ).toContain('<main data-record-body dir="rtl"><p>שָׁלוֹם</p></main>')
})
