import { afterEach, describe, expect, test } from 'bun:test'
import { bookFrame, SegnaviaBook } from './book.ts'
import { reflectedBookElement } from './book-test-view.ts'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function element() {
  const book = new SegnaviaBook()
  let mounts = 0
  let clears = 0
  ;(book as unknown as { mount: () => void }).mount = () => mounts++
  ;(book as unknown as { replaceChildren: () => void }).replaceChildren = () => clears++
  ;(book as unknown as { querySelector: () => null }).querySelector = () => null
  return { book, mounts: () => mounts, clears: () => clears }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('book element input', () => {
  test('the view property parses and rebuilds the frame', () => {
    const { book, mounts } = element()
    book.view = { html: '<main>שלום</main>', lang: 'he' }
    expect(book.view).toEqual({ html: '<main>שלום</main>', lang: 'he', scripts: 'refuse' })
    expect(mounts()).toBe(1)

    book.view = { html: '<main>Second</main>', title: 'Named book' }
    expect(book.view?.title).toBe('Named book')
    expect(mounts()).toBe(2)
  })

  test('the src attribute fetches, parses and rebuilds a view', async () => {
    const requested: string[] = []
    globalThis.fetch = (async (input) => {
      requested.push(String(input))
      return Response.json({ html: '<main>Fetched</main>', title: 'Fetched book' })
    }) as typeof fetch
    const { book, mounts } = element()
    await book.attributeChangedCallback('src', null, 'https://example.test/book.json')
    expect(requested).toEqual(['https://example.test/book.json'])
    expect(book.view?.title).toBe('Fetched book')
    expect(mounts()).toBe(1)
  })

  test('a slower old src cannot replace the latest src', async () => {
    const a = deferred<Response>()
    const b = deferred<Response>()
    globalThis.fetch = ((input) => (String(input).endsWith('/a.json') ? a.promise : b.promise)) as typeof fetch
    const { book, mounts } = element()
    const loadingA = book.attributeChangedCallback('src', null, 'https://example.test/a.json')
    const loadingB = book.attributeChangedCallback('src', 'https://example.test/a.json', 'https://example.test/b.json')
    b.resolve(Response.json({ html: '<main>B</main>', title: 'B' }))
    await loadingB
    a.resolve(Response.json({ html: '<main>A</main>', title: 'A' }))
    await loadingA
    expect(book.view?.title).toBe('B')
    expect(mounts()).toBe(1)
  })

  test('a view assignment cannot be replaced by an older src', async () => {
    const response = deferred<Response>()
    globalThis.fetch = (() => response.promise) as unknown as typeof fetch
    const { book, mounts } = element()
    const loading = book.attributeChangedCallback('src', null, 'https://example.test/book.json')
    book.view = { html: '<main>Property</main>', title: 'Property' }
    response.resolve(Response.json({ html: '<main>Fetched</main>', title: 'Fetched' }))
    await loading
    expect(book.view?.title).toBe('Property')
    expect(mounts()).toBe(1)
  })

  test('removing src clears its view and frame', async () => {
    globalThis.fetch = (async () => Response.json({ html: '<main>Fetched</main>' })) as unknown as typeof fetch
    const { book, clears } = element()
    await book.attributeChangedCallback('src', null, 'https://example.test/book.json')
    await book.attributeChangedCallback('src', 'https://example.test/book.json', null)
    expect(book.view).toBeNull()
    expect(clears()).toBe(1)
  })

  test('a failed fetch fires error with its message', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch
    const { book } = element()
    let detail: unknown
    ;(book as unknown as { dispatchEvent: (event: Event) => boolean }).dispatchEvent = (event) => {
      detail = (event as CustomEvent).detail
      return true
    }
    await book.attributeChangedCallback('src', null, 'https://example.test/book.json')
    expect(detail).toEqual({ message: 'The book at https://example.test/book.json answered 503.' })
  })

  test('the frame description uses book direction, security policy and labels', () => {
    const hebrew = bookFrame({ html: '<main>שלום</main>', lang: 'he', scripts: 'refuse' })
    expect(hebrew.title).toBe('ספר')
    expect(hebrew.srcdoc).toContain('<html dir="rtl" lang="he">')
    expect(hebrew.srcdoc).toContain("script-src 'nonce-")
    expect(hebrew.srcdoc).not.toContain('segnavia:height')

    const named = bookFrame({ html: '<main>Book</main>', title: 'Named book', scripts: 'sandboxed' })
    expect(named.title).toBe('Named book')
    expect(named.srcdoc).not.toContain("script-src 'nonce-")
  })

  test('sanitizes book CSS and places it after generated fonts', () => {
    const rendered = bookFrame(
      { html: '<main class="lead">Book</main>', css: '.lead{color:purple;background:url(https://example.test/ink.png)}', scripts: 'refuse' },
      '@font-face{font-family:Held;src:url(data:font/woff2;base64,AA==)}',
    )
    expect(rendered.srcdoc).not.toContain('example.test')
    expect(rendered.srcdoc.indexOf('@font-face')).toBeLessThan(rendered.srcdoc.indexOf('.lead{color:purple;}'))
  })

  test('a paginated frame uses the composer and carries the spread setting', () => {
    const pagination = {
      paper: { width: 148, height: 210 },
      margin: { top: 12, bottom: 12, inner: 15, outer: 10 },
      columnGap: 4,
      direction: 'ltr' as const,
      numbering: { frontMatter: 'roman-lower' as const, body: 'arabic' as const },
      rectoOpenings: false,
      orphans: 2,
      widows: 2,
      parents: [],
      endnotePlacement: 'book' as const,
      contents: { pageNumbers: true, depth: 2 },
      runningHead: { recto: 'title' as const, verso: 'title' as const },
    }
    const rendered = bookFrame(
      { html: '<main class="lead" data-segnavia-galleys></main>', css: '.lead{color:purple}', scripts: 'refuse', pagination },
      '.font-marker{font-family:Held}',
      true,
    )
    expect(rendered.srcdoc).toContain('"screen":{"spread":true}')
    expect(rendered.srcdoc.indexOf('.font-marker')).toBeLessThan(rendered.srcdoc.indexOf('.lead{color:purple}'))
  })

  test('the layout attribute and property reflect accepted values and refuse an unknown value by name', () => {
    const { book, attributes } = reflectedBookElement()
    const errors: string[] = []
    book.dispatchEvent = ((event: Event) => {
      if (event.type === 'error') errors.push((event as CustomEvent<{ message: string }>).detail.message)
      return true
    }) as typeof book.dispatchEvent

    expect(book.layout).toBe('pages')
    book.layout = 'flow'
    expect(book.layout).toBe('flow')
    expect(attributes.get('layout')).toBe('flow')
    ;(book as unknown as { setAttribute: (name: string, value: string) => void }).setAttribute('layout', 'grid')
    expect(book.layout).toBe('flow')
    expect(attributes.get('layout')).toBe('flow')
    expect(errors).toEqual(['Unknown book layout "grid"; accepted layouts are "pages" and "flow".'])
  })
})

describe('book fonts', () => {
  test('toggling spread supersedes a pending font resolution without reporting its abort', async () => {
    const pending = deferred<void>()
    const mounted: Array<{ title: string; srcdoc: string }> = []
    const errors: unknown[] = []
    let resolutions = 0
    let spread = false
    const book = new SegnaviaBook()
    Object.defineProperty(book, 'isConnected', { configurable: true, get: () => true })
    ;(book as unknown as { hasAttribute: (name: string) => boolean }).hasAttribute = (name) => name === 'spread' && spread
    ;(book as unknown as { mountFrames: (view: Parameters<typeof bookFrame>[0], css: string | undefined) => void }).mountFrames = (view, css) =>
      mounted.push(bookFrame(view, css, spread, book.layout))
    book.dispatchEvent = ((event: Event) => {
      if (event.type === 'error') errors.push((event as CustomEvent).detail)
      return true
    }) as typeof book.dispatchEvent
    book.fonts = {
      source: {
        font: async (_name, { signal }) => {
          resolutions++
          if (resolutions === 1) await pending.promise
          signal.throwIfAborted()
          return { family: 'Body Serif', faces: [], generic: 'serif' }
        },
      },
    }
    book.view = {
      html: '<main data-segnavia-galleys></main>',
      title: 'Latest',
      fonts: [{ app: 'serif' }],
      pagination: {
        paper: { width: 148, height: 210 },
        margin: { top: 12, bottom: 12, inner: 15, outer: 10 },
        columnGap: 4,
        direction: 'ltr',
        numbering: { frontMatter: 'roman-lower', body: 'arabic' },
        rectoOpenings: false,
        orphans: 2,
        widows: 2,
        parents: [],
        endnotePlacement: 'book',
        contents: { pageNumbers: true, depth: 2 },
        runningHead: { recto: 'title', verso: 'title' },
      },
    }
    spread = true
    await book.attributeChangedCallback('spread', null, '')
    pending.resolve()
    for (let i = 0; i < 8; i += 1) await Promise.resolve()

    expect(errors).toEqual([])
    expect(mounted.at(-1)?.title).toBe('Latest')
    expect(mounted.at(-1)?.srcdoc).toContain('"screen":{"spread":true}')
  })

  test('toggling spread during a source fetch leaves that fetch to mount its book', async () => {
    let spread = false
    let resolveResponse!: (response: Response) => void
    globalThis.fetch = ((_input, init) =>
      new Promise<Response>((resolve, reject) => {
        resolveResponse = resolve
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })) as typeof fetch
    const mounted: Array<{ title: string; srcdoc: string }> = []
    const book = new SegnaviaBook()
    Object.defineProperty(book, 'isConnected', { configurable: true, get: () => true })
    ;(book as unknown as { hasAttribute: (name: string) => boolean }).hasAttribute = (name) => name === 'spread' && spread
    ;(book as unknown as { mountFrames: (view: Parameters<typeof bookFrame>[0], css: string | undefined) => void }).mountFrames = (view, css) =>
      mounted.push(bookFrame(view, css, spread, book.layout))
    book.fonts = { source: { font: async () => ({ family: 'Body Serif', faces: [], generic: 'serif' }) } }
    book.view = { html: '<main>Initial</main>', title: 'Initial' }
    await Promise.resolve()
    const loading = book.attributeChangedCallback('src', null, 'https://example.test/book.json')
    spread = true
    await book.attributeChangedCallback('spread', null, '')
    resolveResponse(Response.json({ html: '<main>Fetched</main>', title: 'Fetched' }))
    await loading
    for (let i = 0; i < 4; i += 1) await Promise.resolve()

    expect(book.view?.title).toBe('Fetched')
    expect(mounted.at(-1)?.title).toBe('Fetched')
  })

  test('fonts and view assigned before connection mount the latest frame on connect', async () => {
    const previousDocument = globalThis.document
    const previousWindow = globalThis.window
    const frames: Array<{ srcdoc: string; title: string; setAttribute: (name: string, value: string) => void }> = []
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        createElement() {
          const frame = { srcdoc: '', title: '', setAttribute() {} }
          frames.push(frame)
          return frame
        },
      },
    })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { addEventListener() {}, removeEventListener() {} },
    })
    const book = new SegnaviaBook()
    let connected = false
    Object.defineProperty(book, 'isConnected', { configurable: true, get: () => connected })
    ;(book as unknown as { hasAttribute: () => boolean }).hasAttribute = () => true
    book.replaceChildren = (() => {}) as typeof book.replaceChildren
    book.fonts = {
      source: {
        font: async () => ({ family: 'Body Serif', faces: [], generic: 'serif' }),
      },
    }
    book.view = { html: '<main>Book</main>', fonts: [{ app: 'serif' }] }
    await Promise.resolve()
    expect(frames).toHaveLength(0)
    connected = true
    book.connectedCallback()
    await Promise.resolve()
    await Promise.resolve()
    globalThis.document = previousDocument
    globalThis.window = previousWindow
    expect(frames.at(-1)?.srcdoc).toContain('--segnavia-font-serif:"Body Serif",serif')
  })

  test('setting fonts mounts a frame whose srcdoc carries the resolved css', async () => {
    const frames: Array<{ srcdoc: string; title: string; setAttribute: (name: string, value: string) => void }> = []
    const previous = globalThis.document
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        createElement() {
          const frame = { srcdoc: '', title: '', setAttribute() {} }
          frames.push(frame)
          return frame
        },
      },
    })
    const book = new SegnaviaBook()
    Object.defineProperty(book, 'isConnected', { configurable: true, get: () => true })
    ;(book as unknown as { hasAttribute: () => boolean }).hasAttribute = () => false
    const children: unknown[] = []
    book.replaceChildren = ((...nodes: unknown[]) => {
      children.splice(0, children.length, ...nodes)
    }) as typeof book.replaceChildren
    book.fonts = {
      source: {
        font: async (name) =>
          name === 'serif'
            ? { family: 'Body Serif', faces: [{ family: 'Body Serif', data: new Uint8Array([0]), format: 'truetype' }], generic: 'serif' }
            : undefined,
      },
    }
    book.view = { html: '<main>Book</main>', title: 'Named book', fonts: [{ app: 'serif' }] }
    await Promise.resolve()
    await Promise.resolve()
    globalThis.document = previous
    expect(frames.at(-1)?.srcdoc).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(frames.at(-1)?.srcdoc).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(children).toHaveLength(1)
  })

  test('an unknown app font surfaces through the error event', async () => {
    const book = new SegnaviaBook()
    Object.defineProperty(book, 'isConnected', { configurable: true, get: () => true })
    let detail: unknown
    ;(book as unknown as { dispatchEvent: (event: Event) => boolean }).dispatchEvent = (event) => {
      detail = (event as CustomEvent).detail
      return true
    }
    book.fonts = { source: { font: async () => undefined } }
    book.view = { html: '<main>Book</main>', title: 'Named book', fonts: [{ app: 'missing' }] }
    for (let i = 0; i < 8 && detail === undefined; i += 1) await Promise.resolve()
    expect(detail).toEqual({
      message: 'book "Named book" could not establish app font "missing"; make that font available from the source to clear this refusal.',
    })
  })

  test('named app fonts without a FontSource surface through the error event', () => {
    const book = new SegnaviaBook()
    let detail: unknown
    book.dispatchEvent = ((event: Event) => {
      detail = (event as CustomEvent).detail
      return true
    }) as typeof book.dispatchEvent
    book.view = { html: '<main>Book</main>', title: 'Named book', fonts: [{ app: 'serif' }] }
    expect(detail).toEqual({
      message: 'book "Named book" could not establish app font "serif"; supply a FontSource to clear this refusal.',
    })
  })

  test('a local font fallback without a FontSource surfaces through the error event', () => {
    const book = new SegnaviaBook()
    let detail: unknown
    book.dispatchEvent = ((event: Event) => {
      detail = (event as CustomEvent).detail
      return true
    }) as typeof book.dispatchEvent
    book.view = { html: '<main>Book</main>', title: 'Named book', fonts: [{ local: 'Local Face', fallback: 'serif' }] }
    expect(detail).toEqual({
      message: 'book "Named book" could not establish app font "serif"; supply a FontSource to clear this refusal.',
    })
  })
})
