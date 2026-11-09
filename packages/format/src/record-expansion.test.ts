import { describe, expect, test } from 'bun:test'
import { Document } from './document.ts'
import { bookFromDocument, printedFromDocument } from './document-lowering.ts'

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

  test('lowers records at the book root, in a division and in a part', () => {
    const record = (id: string, title: string, name: string) => ({ type: 'record' as const, id, title, template: 'row', values: { name } })
    const document = Document.parse({
      type: 'document',
      kind: 'book',
      title: 'Records',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
      templates: input().templates,
      children: [
        {
          type: 'part',
          name: 'rows',
          children: [record('row-1', 'One', 'Name 1')],
        },
        record('row-2', 'Two', 'Name 2'),
      ],
    })
    const book = bookFromDocument(document)
    expect(book.body[0]).toMatchObject({
      name: 'rows',
      children: [{ id: 'row-1', title: 'One', values: { name: 'Name 1' }, record: { index: 1, count: 2 }, opens: 'any', numbering: { restart: 1 } }],
    })
    expect(book.body[1]).toMatchObject({
      id: 'row-2',
      title: 'Two',
      values: { name: 'Name 2' },
      record: { index: 2, count: 2 },
      opens: 'any',
      numbering: { restart: 1 },
    })
  })

  test('matches the book title rule for records in body and front matter', () => {
    const base = {
      type: 'document' as const,
      kind: 'book' as const,
      title: 'Records',
      mode: 'paginated' as const,
      page: { paper: 'a5' as const, margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
      templates: input().templates,
    }
    const untitled = { type: 'record' as const, template: 'row', values: { name: 'Name' } }
    expect(() => Document.parse({ ...base, children: [untitled] })).toThrow('a body record needs a title; provide title to clear this refusal')
    expect(() => Document.parse({ ...base, children: [{ type: 'division', name: 'front', children: [untitled] }] })).not.toThrow()
  })
})
