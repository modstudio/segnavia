import { describe, expect, test } from 'bun:test'
import { animationReport } from './animation-timing.ts'
import {
  BLOCK_DIRECTION_CSS,
  bridgeForHost,
  documentNeedsSlotFit,
  type FrameOptions,
  frameDocument,
  frameSandbox,
  frameStyleSheets,
  MESSAGE,
  messageFrom,
  newNonce,
  PRINT_BACKGROUND_RESOURCE_LIMIT,
  RELAYED_KEYS,
  SELECTION_TEXT_LIMIT,
  selectionMessage,
  slotFitMessageData,
} from './bridge.ts'

describe('frame document', () => {
  test('shrink, truncate and refuse slot markers need fitting', () => {
    expect(documentNeedsSlotFit('<p>No slots</p>')).toBe(false)
    expect(documentNeedsSlotFit('<p data-slot-overflow="name:wrap">Wrap</p>')).toBe(false)
    expect(documentNeedsSlotFit('<p data-slot-overflow="name:truncate">Truncate</p>')).toBe(true)
    expect(documentNeedsSlotFit('<p data-slot-overflow="name:shrink:6">Shrink</p>')).toBe(true)
    expect(documentNeedsSlotFit("<p data-slot-overflow='name:refuse'>Refuse</p>")).toBe(true)
  })

  test('can omit the bridge while preserving the rest of the document head', () => {
    const html = frameDocument('<p>x</p>', {
      scripts: 'refuse',
      nonce: 'n',
      bridge: false,
      dir: 'rtl',
      lang: 'he',
      css: 'p{color:red}',
      csp: "img-src 'none'",
      printAtMs: 0,
      sheets: frameStyleSheets(undefined, undefined),
    })
    expect(html).not.toContain('<script')
    expect(html).toContain("default-src 'none'; script-src 'none'")
    expect(html).toContain("object-src 'none'; base-uri 'none'; form-action 'none'")
    expect(html).toContain('<meta http-equiv="Content-Security-Policy" content="img-src \'none\'">')
    expect(html.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(2)
    expect(html).toContain('<style>*,*::before,*::after{animation-play-state:paused!important}</style>')
    expect(html).toContain(BLOCK_DIRECTION_CSS)
    expect(html).toContain('<style>p{color:red}</style>')
    expect(html).toContain('<html dir="rtl" lang="he">')
    const sandboxed = frameDocument('<p>x</p>', {
      scripts: 'sandboxed',
      nonce: 'n',
      bridge: false,
      origins: [{ origin: 'https://cdn.example', kinds: ['script', 'style', 'font'] }],
    })
    expect(sandboxed).toContain("script-src 'none'")
    expect(sandboxed).toContain("style-src 'unsafe-inline' https://cdn.example")
    expect(sandboxed).toContain('font-src data: https://cdn.example')
    expect(sandboxed).toContain("connect-src 'none'")
  })

  test('sandbox tokens allow forms only for the exact scripted mode and never same-origin', () => {
    const sandboxes = [frameSandbox('sandboxed'), frameSandbox('refuse'), frameSandbox(undefined)]
    expect(sandboxes).toEqual(['allow-scripts allow-forms', 'allow-scripts', 'allow-scripts'])
    expect(sandboxes.every((sandbox) => !sandbox.includes('allow-same-origin'))).toBe(true)
  })
  test('relays viewer and presentation shortcuts', () => {
    expect(RELAYED_KEYS).toEqual(expect.arrayContaining(['m', 'c', 'f']))
  })
  test('does not relay letter shortcuts from editable targets', () => {
    let onKey: ((event: { key: string; target: unknown }) => void) | undefined
    const messages: unknown[] = []
    const document = {
      addEventListener: (name: string, listener: typeof onKey) => {
        if (name === 'keydown') onKey = listener
      },
      fonts: null,
      images: [],
      readyState: 'loading',
    }
    const parent = { postMessage: (message: unknown) => messages.push(message) }
    const window = { addEventListener: () => {} }
    Function('document', 'parent', 'window', bridgeForHost({ reportHeight: false }))(document, parent, window)
    onKey?.({ key: 'c', target: { tagName: 'SELECT', isContentEditable: false } })
    expect(messages).toEqual([])
  })
  test('the policy and the bridge come before anything the author wrote', () => {
    const html = frameDocument('<!doctype html><html><head><script>evil()</script></head><body>x</body></html>', { scripts: 'refuse', nonce: 'n1' })
    const policy = html.indexOf("script-src 'nonce-n1'")
    expect(policy).toBeGreaterThan(-1)
    expect(policy).toBeLessThan(html.indexOf('evil()'))
    expect(html.indexOf('<script nonce="n1">')).toBeLessThan(html.indexOf('evil()'))
    expect(html.match(/<!doctype/gi)?.length).toBe(1)
  })

  test('sandboxed scripts carry the dependency policy and refuse connections', () => {
    const html = frameDocument('<p>x</p>', { scripts: 'sandboxed', nonce: 'n' })
    expect(html).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain("new CustomEvent('segnavia:print'")
    expect(html).toContain("form-action 'none'")
  })

  test('an unknown script mode fails closed without the storage shim', () => {
    const html = frameDocument('<p>x</p>', { nonce: 'n' } as FrameOptions)
    expect(html).toContain("script-src 'nonce-n'")
    expect(html).not.toContain("Object.defineProperty(window,'localStorage'")
  })

  test('approved dependency origins are written into scripted CSP directives', () => {
    const html = frameDocument('<p>x</p>', {
      scripts: 'sandboxed',
      nonce: 'n',
      origins: [{ origin: 'https://cdn.jsdelivr.net', kinds: ['script', 'style', 'font'] }],
    })
    const content = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1]
    if (!content) throw new Error('The frame document has no CSP meta element.')
    const directives = Object.fromEntries(
      content.split('; ').map((directive) => {
        const [name, ...sources] = directive.split(' ')
        return [name, sources]
      }),
    )
    expect(directives['script-src']).toContain('https://cdn.jsdelivr.net')
    expect(directives['style-src']).toContain('https://cdn.jsdelivr.net')
    expect(directives['font-src']).toContain('https://cdn.jsdelivr.net')
  })

  test('only refused-script documents answer a parent selection request', () => {
    const refused = frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n' })
    expect(refused).toContain(MESSAGE.selectionRequest)
    expect(refused).toContain('e.source===parent')
    expect(frameDocument('<p>x</p>', { scripts: 'sandboxed', nonce: 'n' })).not.toContain(MESSAGE.selectionRequest)
    expect(bridgeForHost()).not.toContain(MESSAGE.selectionRequest)
  })

  test('the emitted bridge uses the shared animation calculation', async () => {
    expect(bridgeForHost({ reportHeight: false })).toContain(animationReport.toString())
    const messages: unknown[] = []
    const document = {
      addEventListener: () => {},
      fonts: null,
      images: [],
      readyState: 'complete',
      documentElement: { getBoundingClientRect: () => ({ height: 0 }) },
      getAnimations: () => [
        { effect: { getComputedTiming: () => ({ endTime: 1250, iterations: 1 }) } },
        { effect: { getComputedTiming: () => ({ endTime: 3200, iterations: 2 }) } },
      ],
      querySelector: () => null,
      querySelectorAll: () => [],
    }
    const parent = { postMessage: (value: unknown) => messages.push(value) }
    const window = { addEventListener: () => {} }
    Function('document', 'parent', 'window', 'MutationObserver', bridgeForHost({ reportHeight: false }))(document, parent, window, undefined)
    await Promise.resolve()
    expect(messages[0]).toEqual({ type: MESSAGE.animation, animated: true, lengthMs: 3200 })
  })

  test('the bridge handles in-page links within its declared message surface and policy', () => {
    const html = frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n' })
    expect(html).toContain("window.addEventListener('click'")
    expect(html).toContain("href.charAt(0)!=='#'")
    expect(html).not.toMatch(/fragment=decodeURIComponent/)
    expect(html.match(/decodeURIComponent/g)).toHaveLength(2)
    expect(html).toContain('try{return decodeURIComponent(run);}catch(error){return run;}')
    expect([...html.matchAll(/post\(\{type:'([^']+)'/g)].map((match) => match[1])).toEqual([
      MESSAGE.selection,
      MESSAGE.heading,
      MESSAGE.heading,
      MESSAGE.animation,
      MESSAGE.slotFit,
      MESSAGE.key,
      MESSAGE.height,
      MESSAGE.fontFailures,
      MESSAGE.ready,
    ])
    expect(html).toContain("default-src 'none'; script-src 'nonce-n'")
    expect(html).toContain("media-src * data: blob:; connect-src *; frame-src *; worker-src 'none'")
  })

  test('runs the keep pass without expanding the relay surface', () => {
    const script = bridgeForHost({ reportHeight: false })
    expect(script).toContain('querySelectorAll("[style]")')
    expect(script).toContain('style.breakAfter = "avoid"')
    expect(RELAYED_KEYS).toEqual(['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Escape', ' ', 'm', 'c', 'f'])
  })

  test('direction and language land on the root the author declared, or one we supply', () => {
    expect(frameDocument('<html lang="en"><body>x</body></html>', { scripts: 'refuse', nonce: 'n', dir: 'rtl' })).toContain('<html lang="en" dir="rtl">')
    expect(frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n', dir: 'rtl', lang: 'he' })).toContain('<html dir="rtl" lang="he"><body><p>x</p>')
  })

  test("an author's root direction wins without a duplicate attribute", () => {
    const html = frameDocument('<html dir="ltr"><body>שלום</body></html>', { scripts: 'refuse', nonce: 'n', dir: 'rtl' })
    expect(html).toContain('<html dir="ltr">')
    expect(html.match(/<html[^>]*\sdir\s*=/gi)).toHaveLength(1)
  })

  test("an author's root language wins without a duplicate attribute", () => {
    const html = frameDocument('<html lang="fr"><body>x</body></html>', { scripts: 'refuse', nonce: 'n', lang: 'he' })
    expect(html).toContain('<html lang="fr">')
    expect(html.match(/<html[^>]*\slang\s*=/gi)).toHaveLength(1)
  })

  test('block direction stays in the base layer before the unlayered host style', () => {
    const html = frameDocument('<p>x</p>', {
      scripts: 'refuse',
      nonce: 'n',
      sheets: frameStyleSheets(undefined, undefined),
      css: 'p{unicode-bidi:normal}',
    })
    expect(html.indexOf('unicode-bidi:plaintext')).toBeLessThan(html.indexOf('p{unicode-bidi:normal}'))
    expect(html).toContain(BLOCK_DIRECTION_CSS)
    expect(html).not.toContain(`<style>${BLOCK_DIRECTION_CSS}</style>`)
  })

  test('block direction leaves a valid own dir alone and keeps zero specificity', () => {
    const selector = BLOCK_DIRECTION_CSS.slice(0, BLOCK_DIRECTION_CSS.indexOf('{'))
    expect(selector).toBe(
      ':where(:is(p,li,dt,dd,h1,h2,h3,h4,h5,h6,blockquote,figcaption,caption,td,th,summary,label,pre,div,section,article,aside,address):not([dir="ltr" i],[dir="rtl" i],[dir="auto" i]))',
    )
  })

  test('a document without explicit sheets still receives the compiled base layer', () => {
    const html = frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n' })
    expect(html).toContain(BLOCK_DIRECTION_CSS)
    expect(html).not.toContain(`<style>${BLOCK_DIRECTION_CSS}</style>`)
  })

  test('print documents lift root backgrounds and wait for CSS background images', () => {
    const html = frameDocument('<html><body>print</body></html>', { scripts: 'refuse', nonce: 'n', printBackground: true })
    expect(html).toContain('data-segnavia-print-background')
    expect(html).toContain("root.style.isolation='isolate'")
    expect(html).toContain('imgs=imgs.concat(backgroundImages())')
    expect(html).toContain("settle(elements[i],'::before')")
    expect(html).toContain('data-segnavia-print-background-image')
    expect(html).toContain("elementStyle.display==='none'||elementStyle.visibility==='hidden'||!rect.width||!rect.height")
    expect(html).toContain(`resourceCount>=${PRINT_BACKGROUND_RESOURCE_LIMIT}`)
    expect(html).toContain('resources[url]')
    expect(html).toContain("layer.indexOf('gradient(')")
    expect(html).toContain("document.createElement('canvas')")
  })

  test('nonces are unguessable and never repeat', () => {
    const a = newNonce()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(newNonce()).not.toBe(a)
  })

  test('slot fit messages accept only bounded records of known states', () => {
    expect(slotFitMessageData({ type: MESSAGE.slotFit, slots: { name: 'shrunk', role: 'fit', bio: 'overflowed', title: 'unmeasured' } })).toEqual({
      type: MESSAGE.slotFit,
      slots: { name: 'shrunk', role: 'fit', bio: 'overflowed', title: 'unmeasured' },
    })
    expect(slotFitMessageData({ type: MESSAGE.slotFit, slots: [] })).toBeNull()
    expect(slotFitMessageData({ type: MESSAGE.slotFit, slots: { name: 'filled' } })).toBeNull()
    expect(
      slotFitMessageData({ type: MESSAGE.slotFit, slots: Object.fromEntries(Array.from({ length: 201 }, (_, index) => [String(index), 'fit'])) }),
    ).toBeNull()
    const source = {} as Window
    const frame = { contentWindow: source } as HTMLIFrameElement
    expect(messageFrom({ source, data: { type: MESSAGE.slotFit, slots: { name: 'fit' } } } as MessageEvent, frame)).toEqual({
      type: MESSAGE.slotFit,
      slots: { name: 'fit' },
    })
  })

  test('selection messages match their frame and request and bound both strings', () => {
    const source = {} as Window
    const frame = { contentWindow: source } as HTMLIFrameElement
    const event = (data: unknown, eventSource: MessageEventSource | null = source) => ({ source: eventSource, data }) as MessageEvent
    expect(selectionMessage(event({ type: MESSAGE.selection, id: 7, text: 'phrase', pageText: 'whole page' }), frame, 7)).toEqual({
      selection: { text: 'phrase', pageText: 'whole page' },
    })
    expect(selectionMessage(event({ type: MESSAGE.selection, id: 7, text: '', pageText: 'whole page' }), frame, 7)).toEqual({
      selection: { text: '', pageText: 'whole page' },
    })
    expect(selectionMessage(event({ type: MESSAGE.selection, id: 7, text: 'phrase', pageText: 'whole page' }, {} as Window), frame, 7)).toBeNull()
    expect(selectionMessage(event({ type: MESSAGE.selection, id: 8, text: 'phrase', pageText: 'whole page' }), frame, 7)).toBeNull()
    expect(selectionMessage(event({ type: MESSAGE.selection, id: 7, text: 1, pageText: 'whole page' }), frame, 7)).toBeNull()
    expect(selectionMessage(event({ type: MESSAGE.selection, id: 7, text: 'phrase', pageText: 1 }), frame, 7)).toBeNull()
    expect(selectionMessage(event({ type: MESSAGE.selection, id: 7, text: 'x'.repeat(SELECTION_TEXT_LIMIT + 1), pageText: 'whole page' }), frame, 7)).toEqual({
      oversize: true,
    })
    expect(selectionMessage(event({ type: MESSAGE.selection, id: 7, text: 'phrase', pageText: 'x'.repeat(SELECTION_TEXT_LIMIT + 1) }), frame, 7)).toEqual({
      oversize: true,
    })
  })
})
