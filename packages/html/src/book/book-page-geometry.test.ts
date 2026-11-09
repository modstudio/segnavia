import { expect, test } from 'bun:test'
import { PX_PER_MM } from '@segnavia/format'
import { bookDocument } from './book-document.ts'
import { parseBookFixture } from './book-test-fixture.ts'

test('designed and templated sections carry their named geometry and holder dimensions', () => {
  const margin = { blockStart: 12, blockEnd: 14, inlineStart: 20, inlineEnd: 18 }
  const book = parseBookFixture({
    title: 'Geometry holders',
    mode: 'paginated',
    page: { paper: 'letter', margin },
    style: { pageGeometries: { wide: { paper: 'letter', orientation: 'landscape', margin } } },
    templates: [{ name: 'plate', html: '<main data-region="body"></main>' }],
    body: [
      { kind: 'designed', title: 'Designed', pageGeometry: 'wide', pages: [{ html: '<p>Art</p>' }] },
      { kind: 'templated', title: 'Templated', pageGeometry: 'wide', template: 'plate', pages: [{ regions: { body: '<p>Words</p>' } }] },
    ],
  })
  const html = bookDocument(book, { build: 'flow' }).html
  const expected = [
    'data-page-geometry="wide"',
    'data-segnavia-designed-page="1"',
    'data-segnavia-templated-page="1"',
    `--segnavia-paper-inline:${279.4 * PX_PER_MM}px`,
    `--segnavia-paper-block:${215.9 * PX_PER_MM}px`,
    `--segnavia-text-inline:${(279.4 - margin.inlineStart - margin.inlineEnd) * PX_PER_MM}px`,
  ]
  for (const detail of expected) expect(html, `built holder includes ${detail}`).toContain(detail)
})
