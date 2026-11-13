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
  if (!lowered || 'pages' in lowered) throw new Error('record lowering did not produce a flowing section')
  expect(lowered.values).toEqual({ name: 'שָׁלוֹם' })
  expect(bindRecordValues(lowered).html).toBe('<p dir="auto">שָׁלוֹם</p>')
})

test('refuses a declared template slot that its HTML never binds', () => {
  expect(() => bindRecordValues({ ...section, html: '<p></p>' })).toThrow('never binds it')
})

test('refuses an unbound declared template slot when the record omits values', () => {
  expect(() => bindRecordValues({ html: '<p></p>', recordTemplate: section.recordTemplate })).toThrow('never binds it')
})

test('inserts a record body before binding values across the composed HTML', () => {
  expect(
    bindRecordValues({
      ...section,
      html: '<article><h1>Profile</h1><main data-record-body>Fallback</main></article>',
      recordBody: '<p data-slot-value="name"></p>',
    }).html,
  ).toBe('<article><h1>Profile</h1><main dir="rtl"><p dir="auto">שָׁלוֹם</p></main></article>')
})

test('leaves a template body point empty when the record has no body', () => {
  expect(
    bindRecordValues({
      html: '<article><main data-record-body><p>Fallback</p></main></article>',
      recordTemplate: { name: 'row', slots: [] },
    }).html,
  ).toBe('<article><main></main></article>')
})

test('keeps a composed body when record binding is applied again', () => {
  const once = bindRecordValues({
    ...section,
    html: '<main data-record-body></main>',
    recordBody: '<p data-slot-value="name"></p>',
  })
  expect(bindRecordValues(once).html).toBe(once.html)
})

test('leaves a weak-direction record body to inherit its rtl template direction', () => {
  expect(
    bindRecordValues({
      html: '<article dir="rtl"><main data-record-body></main></article>',
      recordTemplate: { name: 'row', slots: [] },
      recordBody: '<p>2024</p>',
    }).html,
  ).toContain('<main><p>2024</p></main>')
})

test.each([
  ['no marker', '<article><!-- <main data-record-body></main> --></article>', 'no data-record-body elements'],
  ['several markers', '<main data-record-body></main><aside data-record-body></aside>', '2 data-record-body elements'],
])('refuses a record body when its parsed template has %s', (_name, html, message) => {
  expect(() => bindRecordValues({ id: 'entry', html, recordTemplate: { name: 'row', slots: [] }, recordBody: '<p>Body</p>' })).toThrow(
    `Record "entry" has a body, but template "row" has ${message}; add exactly one data-record-body element to template "row" to clear this refusal.`,
  )
})

test('returns a section without record template or body unchanged', () => {
  const plain = { html: '<p>Body</p>', title: 'Plain' }
  expect(bindRecordValues(plain)).toBe(plain)
})
