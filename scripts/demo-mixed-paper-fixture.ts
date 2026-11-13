import type { DocumentInput } from '@segnavia/format'

export const printedMixedPaperDocument: DocumentInput = {
  type: 'document',
  kind: 'printed',
  settings: { lang: 'en' },
  print: { paper: 'a4' },
  style: {
    pageGeometries: {
      landscape: {
        paper: 'a4',
        orientation: 'landscape',
        margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 },
      },
      letter: {
        paper: 'letter',
        orientation: 'portrait',
        margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 },
      },
    },
  },
  parentPages: [{ type: 'parentPage', name: 'body', geometry: {} }],
  parentRules: [{ parent: 'body' }],
  children: [
    { type: 'section', id: 'a4', children: [{ type: 'page', body: { html: '<h1>MIXED A4 PORTRAIT</h1>' } }] },
    {
      type: 'section',
      id: 'a4-landscape',
      pageGeometry: 'landscape',
      children: [{ type: 'page', body: { html: '<h1>MIXED A4 LANDSCAPE</h1>' } }],
    },
    {
      type: 'section',
      id: 'letter',
      pageGeometry: 'letter',
      children: [{ type: 'page', body: { html: '<h1>MIXED LETTER PORTRAIT</h1>' } }],
    },
    {
      type: 'section',
      id: 'landscape-flow',
      pageGeometry: 'landscape',
      children: [{ type: 'flow', html: '<h1>LANDSCAPE FLOW</h1><p>Flow laid out on landscape paper.</p>' }],
    },
  ],
}
