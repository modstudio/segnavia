import { expect, test } from 'bun:test'
import { documentOutline } from '@segnavia/format'
import { parseDocument } from './document.ts'
import { documentOutlineSource } from './document-outline.ts'

test('gathers one printed outline source with listing facts and document block order', () => {
  let next = 0
  const document = parseDocument(
    {
      type: 'document',
      kind: 'printed',
      settings: { dir: 'rtl', lang: 'he' },
      outline: { depth: 2 },
      print: { paper: 'a4' },
      parentPages: [{ type: 'parentPage', name: 'body', geometry: {} }],
      parentRules: [{ parent: 'body' }],
      children: [
        {
          type: 'section',
          children: [
            {
              type: 'flow',
              html: '<h1>כותרת 1</h1><p>Text</p><h3 data-segnavia-listed="contents">123</h3><h3 data-segnavia-listed="outline">סוף</h3>',
            },
          ],
        },
      ],
    },
    { newId: () => `block-${++next}` },
  )
  const source = documentOutlineSource(document)
  expect(source.direction).toBe('rtl')
  expect(source.blocks).toHaveLength(4)
  expect(source.blocks.every((block) => block.startsWith('block-'))).toBe(true)
  expect(source.headings.map(({ title, listed }) => ({ title, listed }))).toEqual([
    { title: 'כותרת 1', listed: { contents: true, outline: true } },
    { title: '123', listed: { contents: true, outline: false } },
    { title: 'סוף', listed: { contents: false, outline: true } },
  ])
  expect(documentOutline(source).map(({ title, depth }) => ({ title, depth }))).toEqual([
    { title: 'כותרת 1', depth: 1 },
    { title: 'סוף', depth: 2 },
  ])
})

test('gathers headings from a printed document with an implicit section', () => {
  const document = parseDocument({
    type: 'document',
    kind: 'printed',
    print: { paper: 'a4' },
    parentPages: [{ type: 'parentPage', name: 'body', geometry: {} }],
    parentRules: [{ parent: 'body' }],
    children: [{ type: 'page', body: { html: '<h1>Printed heading</h1>' } }],
  })

  expect(documentOutline(documentOutlineSource(document)).map(({ title }) => title)).toEqual(['Printed heading'])
})

test('binds record headings and gives each printed destination a unique id', () => {
  const document = parseDocument({
    type: 'document',
    kind: 'printed',
    print: { paper: 'a4' },
    parentPages: [{ type: 'parentPage', name: 'body', geometry: {} }],
    parentRules: [{ parent: 'body' }],
    templates: [{ type: 'template', name: 'row', slots: [{ key: 'name', label: 'Name', type: 'text' }], html: '<h1 data-slot-value="name"></h1>' }],
    children: [
      { type: 'record', id: 'one', template: 'row', values: { name: 'First' } },
      { type: 'record', id: 'two', template: 'row', values: { name: 'Second' } },
    ],
  })

  const headings = documentOutlineSource(document).headings
  expect(headings.map(({ id, title }) => ({ id, title }))).toEqual([
    { id: expect.stringContaining('one-'), title: 'First' },
    { id: expect.stringContaining('two-'), title: 'Second' },
  ])
  expect(headings[0]?.id).not.toBe(headings[1]?.id)
})
