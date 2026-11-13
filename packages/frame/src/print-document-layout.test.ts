import { expect, test } from 'bun:test'
import { Deck, Imposition, Page } from '@segnavia/format'
import { htmlSlideDocument, printablePageValues } from './print-document.ts'

const layoutScripts = [{ name: 'diagram', script: 'DRAW_DIAGRAM', priority: 0, order: 0, selects: 'pre[data-segnavia-diagram="mermaid"]' }]

test('inlines a resolved diagram provider into a slide document that contains a diagram', () => {
  const deck = Deck.parse({ title: 'Print', size: { width: 1280, height: 720 }, slides: [{ id: 'one', content: { kind: 'html', html: '' } }] })
  const plain = htmlSlideDocument(deck, '<p>Plain</p>', { nonce: 'known' })
  const diagram = htmlSlideDocument(deck, '<pre data-segnavia-diagram="mermaid"></pre>', { nonce: 'known', layoutScripts })
  expect(plain).not.toContain('DRAW_DIAGRAM')
  expect(diagram).toContain('DRAW_DIAGRAM')
})

test('injects a layout provider only into a printed page that selects it', () => {
  const pages = [Page.parse({ html: '<p>Plain</p>' }), Page.parse({ html: '<pre data-segnavia-diagram="mermaid"></pre>' })]
  const imposition = Imposition.parse({ paper: 'letter', columns: 1, rows: 2, cell: { width: 200, height: 130 } })
  const html = printablePageValues(pages, imposition, { nonce: 'test', layoutScripts })
  expect(html.match(/DRAW_DIAGRAM/g)).toHaveLength(1)
})
