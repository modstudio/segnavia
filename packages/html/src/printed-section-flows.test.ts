import { expect, test } from 'bun:test'
import { printedSectionFlows } from './printed-section-flows.ts'

test('binds record values and marks the printed flow', () => {
  const html = printedSectionFlows(
    [
      {
        id: 'row-1',
        html: '<p data-slot-value="name"></p>',
        values: { name: 'Ada' },
        recordTemplate: { name: 'row', slots: [{ key: 'name' }] },
        record: { index: 1, count: 3 },
      },
    ],
    [{ parent: 'body' }],
  )
  expect(html).toContain('<p dir="auto">Ada</p>')
  expect(html).not.toContain('data-slot-value')
  expect(html).toContain('data-record-index="1"')
  expect(html).toContain('data-record-count="3"')
})

test('writes a printed section parentRules override on its flow', () => {
  const rules = [{ parent: 'cover' }]
  const html = printedSectionFlows([{ id: 'cover', html: '<h1>Cover</h1>', parentRules: rules }], [{ parent: 'body' }])
  expect(html).toContain('data-segnavia-parent-rules="[{&quot;parent&quot;:&quot;cover&quot;}]"')
})

const destinationFacts = (html: string) => ({
  targetBlocks: html.match(/class="segnavia-targets"/g)?.length ?? 0,
  headingIds: [...html.matchAll(/<h[1-6][^>]*id="([^"]+)"/g)].map((match) => match[1]),
  hrefs: [...html.matchAll(/<a href="#([^"]+)" tabindex="-1">/g)].map((match) => match[1]),
})

test('a printed section emits exactly one target block whose hrefs equal its heading ids (mutation: append targets twice)', () => {
  const html = printedSectionFlows(
    [{ id: 'section', html: '<h1 data-segnavia-id="title">Title</h1><h2 data-segnavia-id="detail">Detail</h2>' }],
    [{ parent: 'body' }],
  )
  expect(destinationFacts(html)).toEqual({ targetBlocks: 1, headingIds: ['title', 'detail'], hrefs: ['title', 'detail'] })
})

test('a printed record emits exactly one prefixed target block whose hrefs equal its heading ids (mutation: append targets twice)', () => {
  const html = printedSectionFlows(
    [
      {
        id: 'row-1',
        html: '<h1 data-segnavia-id="name" data-slot-value="name"></h1>',
        values: { name: 'Ada' },
        recordTemplate: { name: 'row', slots: [{ key: 'name' }] },
        record: { index: 1, count: 1 },
      },
    ],
    [{ parent: 'body' }],
  )
  expect(destinationFacts(html)).toEqual({ targetBlocks: 1, headingIds: ['row-1-name'], hrefs: ['row-1-name'] })
})
