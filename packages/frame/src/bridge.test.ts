import { describe, expect, test } from 'bun:test'
import { animationReport } from './animation-timing.ts'
import { bridgeForHost, frameDocument, MESSAGE, messageFrom, newNonce, PRINT_BACKGROUND_RESOURCE_LIMIT, RELAYED_KEYS, slotFitMessageData } from './bridge.ts'

function runSlotFitBridge(elements: unknown[], frames?: Array<() => void>): Promise<unknown[]> {
  const messages: unknown[] = []
  let ready = () => {}
  const settled = new Promise<void>((resolve) => {
    ready = resolve
  })
  const document = {
    addEventListener: () => {},
    fonts: null,
    images: [],
    readyState: 'complete',
    documentElement: { getBoundingClientRect: () => ({ height: 0 }) },
    getAnimations: () => [],
    querySelector: () => null,
    querySelectorAll: (selector: string) => (selector === '[data-slot-overflow]' ? elements : []),
  }
  const parent = {
    postMessage: (message: { type?: string }) => {
      messages.push(message)
      if (message.type === MESSAGE.ready) ready()
    },
  }
  const window = {
    addEventListener: () => {},
    getComputedStyle: (element: { style: { fontSize?: string } }) => ({ fontSize: element.style.fontSize ?? '16px' }),
    requestAnimationFrame: frames ? (callback: () => void) => frames.push(callback) : undefined,
  }
  Function(
    'document',
    'parent',
    'window',
    'MutationObserver',
    'setTimeout',
    'clearTimeout',
    bridgeForHost({ reportHeight: false }),
  )(
    document,
    parent,
    window,
    undefined,
    () => 1,
    () => {},
  )
  return settled.then(() => messages)
}

describe('frame document', () => {
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

  test('sandboxed scripts carry no script policy, so the author code runs', () => {
    const html = frameDocument('<p>x</p>', { scripts: 'sandboxed', nonce: 'n' })
    expect(html).not.toContain('script-src')
    expect(html).toContain("new CustomEvent('segnavia:print'")
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

  test('the bridge handles in-page links without expanding its message surface or policy', () => {
    const html = frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n' })
    expect(html).toContain("window.addEventListener('click'")
    expect(html).toContain("href.charAt(0)!=='#'")
    expect(html).not.toMatch(/fragment=decodeURIComponent/)
    expect(html.match(/decodeURIComponent/g)).toHaveLength(2)
    expect(html).toContain('try{return decodeURIComponent(run);}catch(error){return run;}')
    expect([...html.matchAll(/post\(\{type:'([^']+)'/g)].map((match) => match[1])).toEqual([
      MESSAGE.animation,
      MESSAGE.slotFit,
      MESSAGE.key,
      MESSAGE.height,
      MESSAGE.ready,
    ])
    expect(html).toContain(
      "<meta http-equiv=\"Content-Security-Policy\" content=\"script-src 'nonce-n'; object-src 'none'; base-uri 'none'; form-action 'none'\">",
    )
  })

  test('direction and language land on the root the author declared, or one we supply', () => {
    expect(frameDocument('<html lang="en"><body>x</body></html>', { scripts: 'refuse', nonce: 'n', dir: 'rtl' })).toContain('<html lang="en" dir="rtl">')
    expect(frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n', dir: 'rtl', lang: 'he' })).toContain('<html dir="rtl" lang="he"><body><p>x</p>')
  })

  test('block direction comes before the host style, so the host can override it', () => {
    const html = frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n', css: 'p{unicode-bidi:normal}' })
    expect(html.indexOf('unicode-bidi:plaintext')).toBeLessThan(html.indexOf('p{unicode-bidi:normal}'))
  })

  test('print documents measure slot overflow after the layout wait and before ready', () => {
    const html = frameDocument('<p>print</p>', { scripts: 'refuse', nonce: 'n', printAtMs: 0 })
    expect(html).toContain('var finishPrint=function(){freeze();slotFit(function(){')
    expect(html).toContain('.then(function(){settlePrint();})')
    expect(html).not.toContain('then(function(){slotFit();settlePrint();})')
    expect(html).toContain('if(element.getClientRects().length===0){unlaid=true;continue;}')
    expect(html).toContain('if(unlaid&&slotFitTries<40)')
  })

  test('a composed document reports ready only after its composer marks the root', async () => {
    const attributes = new Set<string>()
    let observe = () => {}
    const messages: unknown[] = []
    const document = {
      readyState: 'complete',
      documentElement: { hasAttribute: (name: string) => attributes.has(name), getBoundingClientRect: () => ({ height: 0 }) },
      images: [],
      fonts: { ready: Promise.resolve() },
      getAnimations: () => [],
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    }
    const window = {
      addEventListener: () => {},
      MutationObserver: class {
        constructor(callback: (records: unknown[], observer: { disconnect: () => void }) => void) {
          observe = () => callback([], this)
        }
        observe() {}
        disconnect() {}
      },
    }
    Function(
      'document',
      'parent',
      'window',
      'MutationObserver',
      bridgeForHost({ reportHeight: false, readyAfterAttribute: 'data-done' }),
    )(document, { postMessage: (message: unknown) => messages.push(message) }, window, window.MutationObserver)
    await Promise.resolve()
    expect(messages.some((message) => (message as { type?: string }).type === MESSAGE.ready)).toBe(false)
    attributes.add('data-done')
    observe()
    await Promise.resolve()
    await Promise.resolve()
    expect(messages.at(-1)).toEqual({ type: MESSAGE.ready })
  })

  test('a measured composed document reports its changed height when the composer marks the root', async () => {
    const attributes = new Set<string>()
    const timers: Array<() => void> = []
    let height = 0
    let composed = () => {}
    const messages: unknown[] = []
    const document = {
      readyState: 'complete',
      documentElement: { hasAttribute: (name: string) => attributes.has(name), getBoundingClientRect: () => ({ height }) },
      images: [],
      fonts: { ready: Promise.resolve() },
      getAnimations: () => [],
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    }
    class MutationObserver {
      callback: (records: unknown[], observer: MutationObserver) => void
      constructor(callback: (records: unknown[], observer: MutationObserver) => void) {
        this.callback = callback
      }
      observe(_target: unknown, options: { attributes?: boolean }) {
        if (options.attributes) composed = () => this.callback([], this)
      }
      disconnect() {}
    }
    const window = {
      addEventListener: () => {},
      MutationObserver,
      ResizeObserver: class {
        observe() {}
      },
    }
    Function(
      'document',
      'parent',
      'window',
      'MutationObserver',
      'ResizeObserver',
      'setTimeout',
      bridgeForHost({ reportHeight: true, readyAfterAttribute: 'data-done' }),
    )(document, { postMessage: (message: unknown) => messages.push(message) }, window, MutationObserver, window.ResizeObserver, (callback: () => void) =>
      timers.push(callback),
    )
    height = 2112
    attributes.add('data-done')
    composed()
    timers.shift()?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(messages).toContainEqual({ type: MESSAGE.height, height: 2112 })
    const heightReports = messages.filter((message) => (message as { type?: string }).type === MESSAGE.height)
    composed()
    timers.shift()?.()
    expect(messages.filter((message) => (message as { type?: string }).type === MESSAGE.height)).toEqual(heightReports)
  })

  test('a laid-out inline refuse slot reports fit with zero client dimensions', async () => {
    const element = {
      clientWidth: 0,
      clientHeight: 0,
      scrollWidth: 0,
      scrollHeight: 0,
      getClientRects: () => [{}],
      getAttribute: () => 'name:refuse',
      style: {},
    }
    const messages = await runSlotFitBridge([element])
    expect(messages).toContainEqual({ type: MESSAGE.slotFit, slots: { name: 'fit' } })
    expect(messages.at(-1)).toEqual({ type: MESSAGE.ready })
  })

  test('a retry retains a shrink element first measurement', async () => {
    const shrink = {
      clientWidth: 100,
      clientHeight: 20,
      get scrollWidth() {
        return Number.parseFloat(this.style.fontSize || '20') * 10
      },
      scrollHeight: 20,
      getClientRects: () => [{}],
      getAttribute: () => 'name:shrink:8',
      style: { fontSize: '20px' },
    }
    let waiting = true
    const delayed = {
      clientWidth: 10,
      clientHeight: 10,
      scrollWidth: 10,
      scrollHeight: 10,
      getClientRects: () => (waiting ? [] : [{}]),
      getAttribute: () => 'role:refuse',
      style: {},
    }
    const frames: Array<() => void> = []
    const pending = runSlotFitBridge([shrink, delayed], frames)
    for (let turn = 0; turn < 4 && frames.length === 0; turn++) await Promise.resolve()
    expect(frames).toHaveLength(1)
    waiting = false
    frames.shift()?.()
    const messages = await pending
    expect(messages).toContainEqual({ type: MESSAGE.slotFit, slots: { name: 'shrunk', role: 'fit' } })
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
    expect(slotFitMessageData({ type: MESSAGE.slotFit, slots: { name: 'shrunk', role: 'fit', bio: 'overflowed' } })).toEqual({
      type: MESSAGE.slotFit,
      slots: { name: 'shrunk', role: 'fit', bio: 'overflowed' },
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
})
