import { expect, test } from 'bun:test'
import type { SlotsOptions } from '@segnavia/format'
import { MESSAGE, SELECTION_TEXT_LIMIT } from './bridge.ts'

const style = () => {
  const values = Object.create(null) as Record<string, string>
  return Object.assign(values, {
    removeProperty(name: string) {
      delete values[name]
    },
    setProperty(name: string, value: string) {
      values[name] = value
    },
  })
}

class TestElement extends EventTarget {
  className = ''
  clientWidth = 1000
  offsetHeight = 100
  dataset: Record<string, string> = {}
  dir = ''
  isConnected = true
  style = style()
  title = ''
  private attributes = new Map<string, string>()
  private children: TestElement[] = []
  private parent: TestElement | undefined

  append(child: TestElement) {
    child.parent = this
    this.children.push(child)
  }

  prepend(child: TestElement) {
    child.parent = this
    this.children.unshift(child)
  }

  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this)
  }

  scrollIntoView(options?: ScrollIntoViewOptions) {
    headingScrolls.push({ marker: this, options, firstChild: this.parent?.children[0] === this })
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name: string) {
    return this.attributes.has(name)
  }

  querySelector(selector: string): TestElement | null {
    for (const child of this.children) {
      if (selector === 'iframe' && child instanceof TestFrame) return child
      if (selector === '.segnavia-page__sheet' && child.className === 'segnavia-page__sheet') return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }

  replaceChildren(...children: TestElement[]) {
    this.children = children
    for (const child of children) child.parent = this
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

class TestFrame extends TestElement {
  src = ''
  srcdoc = ''
  posts: unknown[] = []
  contentWindow = { postMessage: (message: unknown) => this.posts.push(message) }

  load() {
    this.dispatchEvent(new Event('load'))
  }
}

const messageListeners = new Set<(event: MessageEvent) => void>()
const headingScrolls: Array<{ marker: TestElement; options?: ScrollIntoViewOptions; firstChild: boolean }> = []
const testDocument = {
  createElement(name: string) {
    return name === 'iframe' ? new TestFrame() : new TestElement()
  },
}
const testWindow = {
  addEventListener(name: string, listener: (event: MessageEvent) => void) {
    if (name === 'message') messageListeners.add(listener)
  },
  removeEventListener(name: string, listener: (event: MessageEvent) => void) {
    if (name === 'message') messageListeners.delete(listener)
  },
}
Object.assign(globalThis, {
  HTMLElement: TestElement,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
})

const { SegnaviaPage } = await import('./page.ts')

const htmlPage = (html: string, scripts: 'refuse' | 'sandboxed' = 'refuse') => ({
  type: 'document' as const,
  kind: 'page' as const,
  settings: { scripts },
  children: [{ type: 'page' as const, body: { html } }],
})
const markdownPage = (markdown: string, scripts: 'refuse' | 'sandboxed' = 'refuse') => ({
  type: 'document' as const,
  kind: 'page' as const,
  settings: { scripts },
  children: [{ type: 'page' as const, body: { markdown } }],
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function selectionHarness() {
  const previousDocument = globalThis.document
  const previousLocation = globalThis.location
  const previousWindow = globalThis.window
  Object.assign(globalThis, { document: testDocument, location: { href: 'https://host.example/' }, window: testWindow })
  headingScrolls.length = 0
  const page = new SegnaviaPage()
  const attributes = new Map<string, string>()
  let children: TestElement[] = []
  Object.defineProperties(page, {
    clientWidth: { configurable: true, value: 1000 },
    dataset: { configurable: true, value: {} },
    isConnected: { configurable: true, value: true },
    style: { configurable: true, value: style() },
  })
  Object.assign(page, {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    hasAttribute: (name: string) => attributes.has(name),
    querySelector(selector: string) {
      for (const child of children) {
        if (selector === 'iframe' && child instanceof TestFrame) return child
        if (selector === '.segnavia-page__sheet' && child.className === 'segnavia-page__sheet') return child
        const nested = child.querySelector(selector)
        if (nested) return nested
      }
      return null
    },
    replaceChildren(...replacements: TestElement[]) {
      children = replacements
    },
  })
  const dispatch = (source: unknown, data: unknown) => {
    const event = { source, data } as MessageEvent
    ;(page as unknown as { onMessage(event: MessageEvent): void }).onMessage(event)
    for (const listener of [...messageListeners]) listener(event)
  }
  return {
    page,
    dispatch,
    frame: () => page.querySelector('iframe') as unknown as TestFrame,
    restore: () => Object.assign(globalThis, { document: previousDocument, location: previousLocation, window: previousWindow }),
  }
}

function loadSlottedPage(harness: ReturnType<typeof selectionHarness>) {
  const asset = deferred<string>()
  harness.page.slots = {
    fill: { id: 'filled', values: { logo: { asset: 'logo' } } },
    resolveAsset: () => asset.promise,
  } as SlotsOptions
  harness.page.load({
    ...htmlPage('<img data-slot-src="logo">'),
    data: { slots: [{ key: 'logo', label: 'Logo', type: 'image' }] },
  })
  return asset
}

test('a selection read between slot documents posts only after the filled document is loaded and ready', async () => {
  const harness = selectionHarness()
  const asset = loadSlottedPage(harness)
  const frame = harness.frame()
  frame.load()
  const pending = harness.page.readSelection()
  expect(frame.posts).toEqual([])

  asset.resolve('data:image/png;base64,AAAA')
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(frame.srcdoc).toContain('data:image/png;base64,AAAA')
  expect(frame.posts).toEqual([])

  frame.load()
  harness.dispatch(frame.contentWindow, { type: MESSAGE.ready })
  expect(frame.posts).toHaveLength(1)
  const { id } = frame.posts[0] as { id: number }
  harness.dispatch(frame.contentWindow, { type: MESSAGE.selection, id, text: '', pageText: 'Filled' })
  expect(await pending).toEqual({ text: '', pageText: 'Filled' })
  harness.restore()
})

test('a selection read after a slot replacement waits for the replacing document to load and report ready', async () => {
  const harness = selectionHarness()
  const asset = loadSlottedPage(harness)
  const frame = harness.frame()
  frame.load()
  harness.dispatch(frame.contentWindow, { type: MESSAGE.ready })

  asset.resolve('data:image/png;base64,AAAA')
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(frame.srcdoc).toContain('data:image/png;base64,AAAA')
  const pending = harness.page.readSelection()
  expect(frame.posts).toEqual([])

  frame.load()
  expect(frame.posts).toEqual([])
  harness.dispatch(frame.contentWindow, { type: MESSAGE.ready })
  expect(frame.posts).toHaveLength(1)
  const { id } = frame.posts[0] as { id: number }
  harness.dispatch(frame.contentWindow, { type: MESSAGE.selection, id, text: '', pageText: 'Filled' })
  expect(await pending).toEqual({ text: '', pageText: 'Filled' })
  harness.restore()
})

test('a ready before the current document load is ignored', async () => {
  const harness = selectionHarness()
  harness.page.load(htmlPage('<p>Page</p>'))
  const frame = harness.frame()
  const pending = harness.page.readSelection()

  harness.dispatch(frame.contentWindow, { type: MESSAGE.ready })
  expect(frame.posts).toEqual([])
  frame.load()
  expect(frame.posts).toEqual([])
  harness.dispatch(frame.contentWindow, { type: MESSAGE.ready })
  expect(frame.posts).toHaveLength(1)

  const { id } = frame.posts[0] as { id: number }
  harness.dispatch(frame.contentWindow, { type: MESSAGE.selection, id, text: '', pageText: 'Page' })
  expect(await pending).toEqual({ text: '', pageText: 'Page' })
  harness.restore()
})

test('a selection posted to the unfilled document is cancelled when the fill replaces it', async () => {
  const harness = selectionHarness()
  const asset = loadSlottedPage(harness)
  const frame = harness.frame()
  frame.load()
  harness.dispatch(frame.contentWindow, { type: MESSAGE.ready })
  const pending = harness.page.readSelection().then(
    () => '',
    (error) => (error instanceof Error ? error.message : String(error)),
  )
  expect(frame.posts).toHaveLength(1)

  asset.resolve('data:image/png;base64,AAAA')
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(await pending).toContain('page changed before it replied')
  harness.restore()
})

test('an oversize selection reply is refused', async () => {
  const harness = selectionHarness()
  harness.page.load(htmlPage('<p>Page</p>'))
  const frame = harness.frame()
  frame.load()
  harness.dispatch(frame.contentWindow, { type: MESSAGE.ready })
  const pending = harness.page.readSelection().then(
    () => '',
    (error) => (error instanceof Error ? error.message : String(error)),
  )
  const { id } = frame.posts[0] as { id: number }
  harness.dispatch(frame.contentWindow, {
    type: MESSAGE.selection,
    id,
    text: 'x'.repeat(SELECTION_TEXT_LIMIT + 1),
    pageText: 'Page',
  })
  expect(await pending).toContain(`${SELECTION_TEXT_LIMIT}-unit limit`)
  harness.restore()
})

test('an unknown heading resolves false', async () => {
  const harness = selectionHarness()
  harness.page.load(markdownPage('# Known'))
  const frame = harness.frame()
  frame.load()
  harness.dispatch(frame.contentWindow, { type: MESSAGE.ready })
  const pending = harness.page.scrollToHeading('unknown')
  const { id } = frame.posts[0] as { id: number }
  harness.dispatch(frame.contentWindow, { type: MESSAGE.heading, id, top: null })
  expect(await pending).toBe(false)
  expect(headingScrolls).toEqual([])
  harness.restore()
})

test('a heading reply scrolls a clamped marker in sheet coordinates', async () => {
  const harness = selectionHarness()
  harness.page.load(markdownPage('# Known'))
  const frame = harness.frame()
  frame.load()
  harness.dispatch(frame.contentWindow, { type: MESSAGE.ready })
  const pending = harness.page.scrollToHeading('known', { behavior: 'smooth' })
  const { id } = frame.posts[0] as { id: number }
  harness.dispatch(frame.contentWindow, { type: MESSAGE.heading, id, top: 500 })
  expect(await pending).toBe(true)
  expect(headingScrolls).toHaveLength(1)
  expect(headingScrolls[0]?.marker.style.insetBlockStart).toBe('100px')
  expect(headingScrolls[0]?.marker.style.display).toBe('block')
  expect(headingScrolls[0]?.marker.style.position).toBe('relative')
  expect(headingScrolls[0]?.marker.style.inlineSize).toBe('0')
  expect(headingScrolls[0]?.marker.style.blockSize).toBe('0')
  expect(headingScrolls[0]?.marker.style.pointerEvents).toBe('none')
  expect(headingScrolls[0]?.marker.style.scrollMarginBlockStart).toBe('var(--segnavia-heading-scroll-margin,0px)')
  expect(headingScrolls[0]?.firstChild).toBe(true)
  expect(headingScrolls[0]?.marker.getAttribute('aria-hidden')).toBe('true')
  expect(headingScrolls[0]?.options).toEqual({ block: 'start', behavior: 'smooth' })
  expect(harness.page.querySelector('.segnavia-page__heading-marker')).toBeNull()
  harness.restore()
})

test('heading scrolling refuses unsafe pages and an over-long id', async () => {
  const harness = selectionHarness()
  await expect(harness.page.scrollToHeading('x'.repeat(257))).rejects.toThrow('not a string from 1 to 256 characters')
  harness.page.load(markdownPage('# Scripted', 'sandboxed'))
  await expect(harness.page.scrollToHeading('scripted')).rejects.toThrow('while author scripts run')
  harness.page.showUrl('https://example.com/page')
  await expect(harness.page.scrollToHeading('hosted')).rejects.toThrow('host-served document')
  harness.restore()
})

test('a pending heading request is cancelled when the page changes', async () => {
  const harness = selectionHarness()
  harness.page.load(markdownPage('# First'))
  const frame = harness.frame()
  frame.load()
  harness.dispatch(frame.contentWindow, { type: MESSAGE.ready })
  const pending = harness.page.scrollToHeading('first')
  expect(frame.posts).toHaveLength(1)
  harness.page.load(markdownPage('# Second'))
  await expect(pending).rejects.toThrow('page changed before it replied')
  harness.restore()
})
