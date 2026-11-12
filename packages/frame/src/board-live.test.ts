import { expect, test } from 'bun:test'
import { Deck, type OriginApproval, Page } from '@segnavia/format'

class TestElement extends EventTarget {
  className = ''
  children: TestElement[] = []
  clientWidth = 320
  dataset: Record<string, string> = {}
  dir = ''
  events: Event[] = []
  isConnected = true
  part = { add() {} }
  style = { removeProperty() {}, setProperty() {} } as unknown as CSSStyleDeclaration
  title = ''
  private attributes = new Map<string, string>()
  append(...children: TestElement[]) {
    this.children.push(...children)
  }
  attachShadow() {
    return { append() {} }
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }
  hasAttribute(name: string) {
    return this.attributes.has(name)
  }
  removeAttribute(name: string) {
    this.attributes.delete(name)
  }
  dispatchEvent(event: Event) {
    this.events.push(event)
    return super.dispatchEvent(event)
  }
  querySelector(selector: string): TestElement | null {
    const matches = (element: TestElement) => (selector === 'iframe' ? element.attributes.has('sandbox') : element.className === selector.slice(1))
    for (const child of this.children) {
      if (matches(child)) return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }
  replaceChildren(...children: TestElement[]) {
    this.children = children
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }
  toggleAttribute(name: string, force?: boolean) {
    const present = force ?? !this.attributes.has(name)
    if (present) this.attributes.set(name, '')
    else this.attributes.delete(name)
    return present
  }
}

function bookItem(foot = '<span data-motif="held"></span>') {
  return {
    kind: 'book' as const,
    size: { width: 100, height: 140 },
    view: {
      html: '<main data-segnavia-galleys></main>',
      pagination: {
        paper: { width: 100, height: 140 },
        margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
        columnGap: 0,
        geometries: [
          {
            paper: { width: 100, height: 140 },
            margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
            columns: { count: 1, gap: 0 },
            parents: [{ name: 'body', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }],
          },
        ],
        direction: 'ltr' as const,
        numbering: { frontMatter: 'roman-lower' as const, body: 'arabic' as const, printed: { frontMatter: true, body: true } },
        rectoOpenings: false,
        orphans: 2,
        widows: 2,
        parents: [
          {
            name: 'body',
            regions: { foot: { edge: 'blockEnd' as const, html: foot } },
            margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
          },
        ],
        endnotePlacement: 'book' as const,
        contents: { pageNumbers: true, depth: 2 },
      },
    },
  }
}

test('passes board motif and placement sources to a live book before its view', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestElement })
  const { liveBoardItem } = await import('./board-live.ts')
  const { expandFrameBookView } = await import('./motif-expansion.ts')
  const motifs = {
    source: {
      motif: async (key: string) => ({
        key,
        revision: 'one',
        label: key,
        fields: [],
        versions: [{ lang: 'en', html: '<strong data-board-book-motif>Expanded</strong><img data-segnavia-media="cover">' }],
        fonts: [],
      }),
    },
  }
  const src = 'data:image/png;base64,AA=='
  const placements = {
    resolve: async () => ({ kind: 'media' as const, media: { format: 'png' as const, size: { width: 20, height: 10 } }, src }),
  }
  const origins: readonly OriginApproval[] = [{ origin: 'https://images.example', kinds: ['image'] }]
  try {
    const live = liveBoardItem(bookItem(), () => {}, { motifs, placements, pageWidths: { standard: 900 }, origins })
    const book = live.element as InstanceType<typeof import('./book.ts')['SegnaviaBook']>
    expect(book.motifs).toBe(motifs)
    expect(book.placements).toBe(placements)
    expect(book.pageWidths).toEqual({ standard: 900 })
    expect(book.origins).toEqual(origins)
    if (!book.view || !book.motifs) throw new Error('the live board book did not receive its view and sources')
    const expanded = await expandFrameBookView(book.view, book.motifs, new AbortController().signal, book.placements)
    expect(expanded.book.pagination?.parents[0]?.regions.foot?.html).toContain('data-board-book-motif')
    expect(expanded.book.pagination?.parents[0]?.regions.foot?.html).toContain(`src="${src}"`)
  } finally {
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})

test('passes a board moment through a live page and its asof event', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const previousCustomElements = Object.getOwnPropertyDescriptor(globalThis, 'customElements')
  const previousResizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')
  const definitions = new Map<string, new () => TestElement>()
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'customElements', {
    configurable: true,
    value: {
      define: (name: string, ElementConstructor: new () => TestElement) => definitions.set(name, ElementConstructor),
      get: (name: string) => definitions.get(name),
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (name: string) => {
        const Constructor = definitions.get(name)
        const element = Constructor ? new Constructor() : new TestElement()
        Object.assign(element, new TestElement())
        for (const method of [
          'append',
          'dispatchEvent',
          'getAttribute',
          'hasAttribute',
          'querySelector',
          'removeAttribute',
          'replaceChildren',
          'setAttribute',
          'toggleAttribute',
        ] as const) {
          Object.defineProperty(element, method, { configurable: true, value: TestElement.prototype[method] })
        }
        return element
      },
    },
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      disconnect() {}
      observe() {}
    },
  })
  try {
    const { liveBoardItem } = await import('./board-live.ts')
    const moment = Date.parse('2026-11-15T12:00:00Z')
    const page = Page.parse({ html: '<p>Page</p>', size: { width: 320, height: 200 }, asOf: { kind: 'current' } })
    const live = liveBoardItem({ kind: 'page', page, size: { width: 320, height: 200 } }, () => {}, { origins: [], moment })
    const element = live.element as unknown as TestElement & { moment?: number }
    const asof = element.events.find((event) => event.type === 'asof') as CustomEvent<{ date: string; moment?: number }> | undefined
    expect(element.moment).toBe(moment)
    expect(asof?.detail).toMatchObject({ date: '2026-11-15', moment })
  } finally {
    for (const [name, descriptor] of [
      ['HTMLElement', previousHTMLElement],
      ['document', previousDocument],
      ['customElements', previousCustomElements],
      ['ResizeObserver', previousResizeObserver],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})

test('reports a live book ErrorEvent and throws one dispatched while mounting', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestElement })
  try {
    const { liveBoardItem } = await import('./board-live.ts')
    const failures: unknown[] = []
    const motifs = {
      source: {
        motif: async (key: string) => ({ key, revision: 'one', label: key, fields: [], versions: [{ lang: 'en', html: '' }], fonts: [] }),
      },
    }
    const live = liveBoardItem(bookItem(), (failure) => failures.push(failure), { motifs, origins: [] })
    const refusal = new Error('composition refused')
    live.element.dispatchEvent(new ErrorEvent('error', { message: refusal.message, error: refusal }))
    expect(failures).toEqual([refusal])
    live.dispose()

    let thrown: unknown
    try {
      liveBoardItem({ ...bookItem(''), view: {} } as never, () => {}, { origins: [] })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
  } finally {
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})

test('passes board origins to live page, paper and deck elements', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const previousCustomElements = Object.getOwnPropertyDescriptor(globalThis, 'customElements')
  const previousResizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')
  const definitions = new Map<string, new () => TestElement>()
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'customElements', {
    configurable: true,
    value: {
      define: (name: string, ElementConstructor: new () => TestElement) => definitions.set(name, ElementConstructor),
      get: (name: string) => definitions.get(name),
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (name: string) => {
        const Constructor = definitions.get(name)
        return Constructor ? new Constructor() : new TestElement()
      },
    },
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      disconnect() {}
      observe() {}
    },
  })
  try {
    const { liveBoardItem } = await import('./board-live.ts')
    const { SegnaviaPage } = await import('./page.ts')
    const { SegnaviaPaper } = await import('./paper.ts')
    const { SegnaviaThumbnail } = await import('./thumbnail.ts')
    const { internalPageLoad, internalPaperPagesLoad, internalThumbnailDeckLoad } = await import('./document-value-load.ts')
    const attachShadow = Object.getOwnPropertyDescriptor(SegnaviaThumbnail.prototype, 'attachShadow')
    const toggleAttribute = Object.getOwnPropertyDescriptor(SegnaviaPage.prototype, 'toggleAttribute')
    const pageLoad = Reflect.get(SegnaviaPage.prototype, internalPageLoad)
    const paperLoad = Reflect.get(SegnaviaPaper.prototype, internalPaperPagesLoad)
    const deckLoad = Reflect.get(SegnaviaThumbnail.prototype, internalThumbnailDeckLoad)
    Object.defineProperty(SegnaviaThumbnail.prototype, 'attachShadow', { configurable: true, value: () => ({ append() {} }) })
    Object.defineProperty(SegnaviaPage.prototype, 'toggleAttribute', {
      configurable: true,
      value(this: { boundedForTest?: boolean }, name: string, force?: boolean) {
        if (name === 'bounded') this.boundedForTest = force
      },
    })
    Reflect.set(SegnaviaPage.prototype, internalPageLoad, () => {})
    Reflect.set(SegnaviaPaper.prototype, internalPaperPagesLoad, () => {})
    Reflect.set(SegnaviaThumbnail.prototype, internalThumbnailDeckLoad, () => {})
    const origins: readonly OriginApproval[] = [{ origin: 'https://images.example', kinds: ['image'] }]
    const inputs = { origins }
    const page = Page.parse({ html: '<p>Page</p>', size: { width: 320, height: 200 } })
    const deck = Deck.parse({ title: 'Deck', slides: [{ id: 'one', content: { kind: 'html', html: '' } }] })
    const imposition = {
      paper: 'letter' as const,
      orientation: 'portrait' as const,
      columns: 1,
      rows: 1,
      cell: { width: 100, height: 100 },
    }
    try {
      const livePage = liveBoardItem({ kind: 'page', page, size: { width: 320, height: 200 } }, () => {}, inputs)
      const livePaper = liveBoardItem({ kind: 'paper', pages: [page], imposition, size: { width: 320, height: 200 } }, () => {}, inputs)
      const liveDeck = liveBoardItem({ kind: 'deck', deck }, () => {}, inputs)
      expect((livePage.element as InstanceType<typeof SegnaviaPage>).origins).toEqual(origins)
      expect((livePage.element as unknown as { boundedForTest?: boolean }).boundedForTest).toBe(true)
      expect((livePaper.element as InstanceType<typeof SegnaviaPaper>).origins).toEqual(origins)
      expect((liveDeck.element as InstanceType<typeof SegnaviaThumbnail>).origins).toEqual(origins)
    } finally {
      Reflect.set(SegnaviaPage.prototype, internalPageLoad, pageLoad)
      Reflect.set(SegnaviaPaper.prototype, internalPaperPagesLoad, paperLoad)
      Reflect.set(SegnaviaThumbnail.prototype, internalThumbnailDeckLoad, deckLoad)
      if (attachShadow) Object.defineProperty(SegnaviaThumbnail.prototype, 'attachShadow', attachShadow)
      else Reflect.deleteProperty(SegnaviaThumbnail.prototype, 'attachShadow')
      if (toggleAttribute) Object.defineProperty(SegnaviaPage.prototype, 'toggleAttribute', toggleAttribute)
      else Reflect.deleteProperty(SegnaviaPage.prototype, 'toggleAttribute')
    }
  } finally {
    for (const [name, descriptor] of [
      ['HTMLElement', previousHTMLElement],
      ['document', previousDocument],
      ['customElements', previousCustomElements],
      ['ResizeObserver', previousResizeObserver],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})

test('routes deck, page and paper values through their internal load seams', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestElement })
  try {
    const { loadLiveDeck, loadLivePage, loadLivePaper } = await import('./board-live.ts')
    const { internalPageLoad, internalPaperPagesLoad, internalThumbnailDeckLoad } = await import('./document-value-load.ts')
    const deck = Deck.parse({ title: 'Deck', slides: [{ id: 'one', content: { kind: 'html', html: '' } }] })
    const page = Page.parse({ html: '<p>Page</p>', size: { width: 320, height: 200 } })
    const received: unknown[] = []
    loadLiveDeck({ [internalThumbnailDeckLoad]: (value: unknown) => received.push(value) } as never, deck)
    loadLivePage({ [internalPageLoad]: (value: unknown) => received.push(value) } as never, page)
    loadLivePaper({ [internalPaperPagesLoad]: (values: unknown) => received.push(values) } as never, [page], {} as never)
    expect(received).toEqual([deck, Page.parse({ ...page, scripts: 'refuse' }), [Page.parse({ ...page, scripts: 'refuse' })]])
  } finally {
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})
