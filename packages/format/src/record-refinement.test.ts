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

const base = {
  type: 'document',
  kind: 'printed',
  print: { paper: 'letter' },
  parentRules: [{ parent: 'body' }],
  parentPages: [{ type: 'parentPage', name: 'body' }],
  templates: [
    {
      type: 'template',
      name: 'row',
      html: '<article><div data-record-body></div></article>',
      slots: [{ key: 'name', label: 'Name', type: 'text' }],
    },
  ],
}

test.each([
  [
    'missing content',
    { id: 'empty', type: 'record' },
    'record empty has neither a template nor a flow; provide a template or one flow child to clear this refusal',
  ],
  [
    'templateless values',
    { id: 'values', type: 'record', values: { name: 'Ada' }, children: [{ type: 'flow', html: '<p>Body</p>' }] },
    'record values has values but no template to declare them; provide a template or remove the values to clear this refusal',
  ],
  [
    'empty children',
    { id: 'empty-children', type: 'record', template: 'row', values: {}, children: [] },
    'record empty-children needs exactly one flow child; replace its children with one flow child to clear this refusal',
  ],
])('refuses %s with the record name and remedy', (_name, record, message) => {
  expect(() => Document.parse({ ...base, children: [record] })).toThrow(message)
})

test.each([
  ['no marker', '<article></article>', 'has no data-record-body elements'],
  ['comment-only marker', '<article><!-- <div data-record-body></div> --></article>', 'has no data-record-body elements'],
  [
    'script and style markers',
    '<article><script>const marker = "<div data-record-body></div>"</script><style>.x::after { content: "<div data-record-body></div>" }</style></article>',
    'has no data-record-body elements',
  ],
  ['several markers', '<div data-record-body></div><div data-record-body></div>', 'has 2 data-record-body elements'],
])('refuses a record body when its template has %s', (_name, html, message) => {
  expect(() =>
    Document.parse({
      ...base,
      templates: [{ ...base.templates[0], html }],
      children: [
        {
          id: 'entry',
          type: 'record',
          template: 'row',
          values: {},
          children: [{ type: 'flow', html: '<p>Body</p>' }],
        },
      ],
    }),
  ).toThrow(`record entry has a flow, but template row ${message}; add exactly one data-record-body element to template row to clear this refusal`)
})

test.each([
  ['a comment naming the marker', '<article><div data-record-body></div><!-- <div data-record-body></div> --></article>'],
  ['a quoted greater-than sign before the marker', '<div title="a > b" data-record-body></div>'],
  ['no whitespace before the marker', '<div class="x"data-record-body></div>'],
])('accepts one body marker alongside %s', (_name, html) => {
  expect(() =>
    Document.parse({
      ...base,
      templates: [{ ...base.templates[0], html }],
      children: [
        {
          id: 'entry',
          type: 'record',
          template: 'row',
          values: {},
          children: [{ type: 'flow', html: '<p>Body</p>' }],
        },
      ],
    }),
  ).not.toThrow()
})

test('handles an explicitly undefined record children property without throwing a TypeError', () => {
  const parsed = Document.parse({
    ...base,
    children: [{ id: 'entry', type: 'record', template: 'row', values: {}, children: undefined }],
  })
  expect(parsed.children[0]).toMatchObject({ id: 'entry', type: 'record', template: 'row', children: undefined })
})
