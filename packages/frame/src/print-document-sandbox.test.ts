import { describe, expect, test } from 'bun:test'
import { Deck, Imposition, Page } from '@segnavia/format'
import { printableDeckValue, printablePageValues } from './print-document.ts'

const grid = Imposition.parse({
  paper: { width: 26, height: 26, unit: 'mm' },
  columns: 2,
  rows: 2,
  cell: { width: 10, height: 10 },
  margin: { top: 2, right: 2, bottom: 2, left: 2 },
  gap: { column: 2, row: 2 },
})

describe('print frame sandbox', () => {
  test('applies each page script mode and its complete policy', () => {
    const refused = printablePageValues([Page.parse({ html: '<p>page</p>' })], grid, { nonce: 'known' })
    const sandboxed = printablePageValues([Page.parse({ html: '<script>1</script>', scripts: 'sandboxed' })], grid, {
      nonce: 'known',
      origins: [{ origin: 'https://cdn.jsdelivr.net', kinds: ['script'] }],
    })
    expect(refused).toContain('sandbox="allow-scripts"')
    expect(sandboxed).toContain('sandbox="allow-scripts allow-forms"')
    expect([refused, sandboxed].every((document) => !document.includes('allow-same-origin'))).toBe(true)
    expect(refused).toContain("script-src 'nonce-known'")
    expect(sandboxed).toContain("default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net")
    expect(refused).not.toContain('var printAt=')
    expect(refused).not.toContain('dispatchPrint()')
  })

  test('keeps a scripted deck URL slide without form submission', () => {
    const deck = Deck.parse({
      title: 'Hosted slide',
      scripts: 'sandboxed',
      slides: [{ id: 'hosted', content: { kind: 'url', src: 'https://example.test/slide' } }],
    })
    expect(printableDeckValue(deck)).toContain('sandbox="allow-scripts"')
    expect(printableDeckValue(deck)).not.toContain('allow-forms')
  })
})
