import { describe, expect, test } from 'bun:test'
import { Document } from './document.ts'
import { printedFromDocument } from './document-lowering.ts'

const slot = (key: string, options: { required?: boolean; type?: 'text' | 'email' } = {}) => ({
  key,
  label: key,
  type: options.type ?? ('text' as const),
  ...(options.required ? { required: true } : {}),
})

function input(overrides: Record<string, unknown> = {}) {
  return {
    type: 'document',
    kind: 'printed',
    print: { paper: 'letter' },
    rules: { every: 'body' },
    parentPages: [{ type: 'parentPage', name: 'body', geometry: {} }],
    templates: [{ type: 'template', name: 'row', html: '<p data-slot-value="name"></p>', slots: [slot('name')] }],
    children: [1, 2, 3].map((index) => ({ type: 'record', id: `row-${index}`, template: 'row', values: { name: `Name ${index}` } })),
    ...overrides,
  }
}

describe('record expansion', () => {
  test('carries values and gives records their reading-order index and count', () => {
    const page = printedFromDocument(Document.parse(input()))
    expect(page.printedPages?.sections).toMatchObject([
      { id: 'row-1', values: { name: 'Name 1' }, record: { index: 1, count: 3 }, opens: 'any', numbering: { restart: 1 } },
      { id: 'row-2', values: { name: 'Name 2' }, record: { index: 2, count: 3 } },
      { id: 'row-3', values: { name: 'Name 3' }, record: { index: 3, count: 3 } },
    ])
  })

  test.each([
    ['unknown template', { templates: [], children: [{ type: 'record', template: 'missing', values: {} }] }, 'is not defined'],
    ['no slots', { templates: [{ type: 'template', name: 'row', html: '<p></p>' }] }, 'has no slots'],
    ['unknown value', { children: [{ type: 'record', template: 'row', values: { other: 'x' } }] }, 'is not declared'],
    [
      'required value',
      {
        templates: [{ type: 'template', name: 'row', html: '<p></p>', slots: [slot('name', { required: true })] }],
        children: [{ type: 'record', template: 'row', values: {} }],
      },
      'required template slot',
    ],
    ['non-text slot', { templates: [{ type: 'template', name: 'row', html: '<p></p>', slots: [slot('name', { type: 'email' })] }] }, 'bind text only'],
    [
      'template parents',
      { templates: [{ type: 'template', name: 'row', html: '<p></p>', parents: { opener: 'body' }, slots: [slot('name')] }] },
      'has parents',
    ],
    ['host collision', { data: { slots: [slot('name')] } }, 'both claim it'],
  ])('refuses %s', (_name, changed, message) => {
    expect(() => Document.parse(input(changed))).toThrow(message)
  })

  test('refuses records in a continuous book', () => {
    expect(() =>
      Document.parse({
        ...input(),
        kind: 'book',
        title: 'Records',
        mode: 'continuous',
        print: undefined,
        rules: undefined,
        parentPages: [],
      }),
    ).toThrow('continuous layout cannot apply')
  })

  test('keeps a Hebrew document language and direction', () => {
    const page = printedFromDocument(Document.parse(input({ settings: { lang: 'he', dir: 'rtl' } })))
    expect(page).toMatchObject({ lang: 'he', dir: 'rtl' })
  })
})
