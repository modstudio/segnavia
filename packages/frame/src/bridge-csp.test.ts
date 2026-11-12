import { describe, expect, test } from 'bun:test'
import { Deck, Page } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'
import { frameDocument } from './bridge.ts'
import { printableDeckValue } from './print-document.ts'
import { printedPageValueDocument } from './printed-page-document.ts'
import { htmlSlideDocument } from './slide-print-document.ts'
import { escapeHtml } from './svg.ts'

const origins = [
  { origin: 'https://img.example', kinds: ['image'] as const },
  { origin: 'https://css.example', kinds: ['style'] as const },
  { origin: 'https://font.example', kinds: ['font'] as const },
]

function cspDirectives(html: string): Record<string, string[]> {
  const content = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1]
  if (!content) throw new Error('The frame document has no CSP meta element.')
  return Object.fromEntries(
    content.split('; ').map((directive) => {
      const [name, ...values] = directive.split(' ')
      return [name, values]
    }),
  )
}

const refused = {
  'default-src': ["'none'"],
  'script-src': ["'nonce-known'"],
  'style-src': [
    "'unsafe-inline'",
    'https://cdn.jsdelivr.net/fontsource/css',
    'https://cdn.jsdelivr.net/fontsource/css/',
    'https://css.example',
    'https://fonts.googleapis.com',
  ],
  'font-src': [
    'data:',
    'https://cdn.jsdelivr.net/fontsource/fonts',
    'https://cdn.jsdelivr.net/fontsource/fonts/',
    'https://font.example',
    'https://fonts.gstatic.com',
  ],
  'img-src': [
    'data:',
    'blob:',
    'https://api.iconify.design',
    'https://images.pexels.com',
    'https://images.unsplash.com',
    'https://img.example',
    'https://plus.unsplash.com',
  ],
  'media-src': ['*', 'data:', 'blob:'],
  'connect-src': ['*'],
  'frame-src': ['*'],
  'worker-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
}

const scripted = {
  ...refused,
  'script-src': [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    'https://cdn.jsdelivr.net',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com',
    'https://code.jquery.com',
    'https://unpkg.com',
  ],
  'media-src': ['data:', 'blob:'],
  'connect-src': ["'none'"],
  'frame-src': ["'none'"],
  'worker-src': ['blob:'],
}

describe('frame content security policy', () => {
  test('materializes one-shot approvals before reading every fetch kind', () => {
    function* oneShotOrigins() {
      yield* origins
    }
    const actual = cspDirectives(frameDocument('<p>frame</p>', { scripts: 'refuse', nonce: 'known', origins: oneShotOrigins() }))
    expect(actual['style-src']).toContain('https://css.example')
    expect(actual['font-src']).toContain('https://font.example')
    expect(actual['img-src']).toContain('https://img.example')
  })

  test('carries approved path prefixes into CSP sources', () => {
    const actual = cspDirectives(
      frameDocument('<p>frame</p>', {
        scripts: 'refuse',
        nonce: 'known',
        origins: [{ origin: 'https://assets.example', kinds: ['style', 'font'], pathname: '/approved' }],
      }),
    )
    expect(actual['style-src']).toContain('https://assets.example/approved')
    expect(actual['style-src']).toContain('https://assets.example/approved/')
    expect(actual['font-src']).toContain('https://assets.example/approved')
    expect(actual['font-src']).toContain('https://assets.example/approved/')
    expect(actual['style-src']).not.toContain('https://assets.example')
    expect(actual['font-src']).not.toContain('https://assets.example')
  })

  test.each([
    ['refuse', refused],
    ['sandboxed', scripted],
  ] as const)('characterizes every directive in %s frames by fetch kind', (scripts, expected) => {
    const actual = cspDirectives(frameDocument('<p>frame</p>', { scripts, nonce: 'known', origins }))
    expect(actual).toEqual(expected)
    expect(actual['style-src']).not.toContain('https://img.example')
    expect(actual['style-src']).not.toContain('https://font.example')
    expect(actual['font-src']).not.toContain('https://img.example')
    expect(actual['img-src']).not.toContain('https://fonts.googleapis.com')
    expect(actual['img-src']).not.toContain('https://fonts.gstatic.com')
    expect(actual['script-src']).toContain(scripts === 'sandboxed' ? 'https://cdn.jsdelivr.net' : "'nonce-known'")
    expect(actual['script-src']).not.toContain(scripts === 'sandboxed' ? "'nonce-known'" : 'https://cdn.jsdelivr.net')
  })

  test('refused-script layout frames close connect-src while ordinary refused frames retain author fetch policy', () => {
    const plain = cspDirectives(frameDocument('<p>frame</p>', { scripts: 'refuse', nonce: 'known' }))
    const layout = cspDirectives(
      frameDocument('<p data-segnavia-layout="margin">frame</p>', {
        scripts: 'refuse',
        nonce: 'known',
        layoutScripts: [{ name: 'margin', script: 'window.segnaviaLayout.define({})', priority: 0, order: 0, selects: '*' }],
      }),
    )
    expect(plain['connect-src']).toEqual(['*'])
    expect(layout['connect-src']).toEqual(["'none'"])
  })

  test('slide, deck and printed-page entry points use the same directive map', () => {
    const deck = Deck.parse({
      title: 'CSP',
      scripts: 'refuse',
      size: { width: 400, height: 200 },
      slides: [{ id: 'one', content: { kind: 'html', html: '<p>slide</p>' } }],
    })
    const slide = htmlSlideDocument(deck, '<p>slide</p>', { nonce: 'known', origins })
    const deckPrint = printableDeckValue(deck, { nonce: 'known', origins })
    const printed = resolvePageHtml(
      Page.parse({
        html: '<p>printed page</p>',
        print: { paper: 'a5' },
        printedPages: {
          parents: [{ name: 'body', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }],
          parentRules: [{ parent: 'body' }],
        },
      }),
    )
    const printedPage = printedPageValueDocument(printed, { nonce: 'known', origins })

    expect(cspDirectives(slide)).toEqual(refused)
    expect(deckPrint).toContain(`srcdoc="${escapeHtml(slide)}`)
    expect(cspDirectives(printedPage)).toEqual(refused)
  })
})
