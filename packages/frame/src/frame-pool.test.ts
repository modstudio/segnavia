import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import type { DeckController, DeckState, ResolvedContent } from './controller.ts'
import { initialDeckState } from './controller-types.ts'
import { FramePool } from './frame-pool.ts'

type Listener = () => void

class TestElement {
  className = ''
  dataset: Record<string, string> = {}
  style = { setProperty() {}, removeProperty() {} }
  title = ''
  inert = false
  isConnected = false
  contentWindow: Record<string, never> | null = null
  private children: TestElement[] = []
  private listeners = new Map<string, Listener[]>()
  private parent: TestElement | null = null

  constructor(readonly tagName: string) {
    if (tagName === 'iframe') this.contentWindow = {}
  }

  append(child: TestElement) {
    child.parent = this
    child.connect(this.isConnected)
    this.children.push(child)
  }

  replaceChildren() {
    for (const child of this.children) child.connect(false)
    this.children = []
  }

  replaceWith(replacement: TestElement) {
    if (!this.parent) return
    const index = this.parent.children.indexOf(this)
    this.connect(false)
    replacement.parent = this.parent
    replacement.connect(this.parent.isConnected)
    this.parent.children[index] = replacement
    this.parent = null
  }

  remove() {
    if (!this.parent) return
    this.parent.children = this.parent.children.filter((child) => child !== this)
    this.parent = null
    this.connect(false)
  }

  setAttribute(name: string, value: string) {
    if (name.startsWith('data-')) this.dataset[dataKey(name)] = value
  }

  removeAttribute(name: string) {
    if (name.startsWith('data-')) delete this.dataset[dataKey(name)]
  }

  toggleAttribute(name: string, force: boolean) {
    if (force) this.setAttribute(name, '')
    else this.removeAttribute(name)
  }

  addEventListener(name: string, listener: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener])
  }

  dispatch(name: string) {
    for (const listener of this.listeners.get(name) ?? []) listener()
  }

  querySelector(selector: string): TestElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }

  querySelectorAll(selector: string): TestElement[] {
    if (selector.includes(' ')) {
      const [parent, child] = selector.split(' ')
      return this.descendants()
        .filter((candidate) => candidate.matches(parent ?? ''))
        .flatMap((candidate) => candidate.querySelectorAll(child ?? ''))
    }
    return this.descendants().filter((candidate) => candidate.matches(selector))
  }

  closest(selector: string): TestElement | null {
    const slideId = selector.match(/^\[data-slide-id="(.+)"\]$/)?.[1]
    let candidate: TestElement | null = this
    while (candidate) {
      if (slideId && candidate.dataset.slideId === slideId) return candidate
      candidate = candidate.parent
    }
    return null
  }

  private descendants(): TestElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()])
  }

  private matches(selector: string): boolean {
    if (selector === 'iframe') return this.tagName === 'iframe'
    if (!selector.startsWith('.segnavia-stage__canvas')) return false
    if (this.className !== 'segnavia-stage__canvas') return false
    return !selector.includes('[data-active]') || 'active' in this.dataset
  }

  private connect(value: boolean) {
    this.isConnected = value
    for (const child of this.children) child.connect(value)
  }
}

function dataKey(attribute: string) {
  return attribute.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

Object.assign(globalThis, {
  document: { createElement: (name: string) => new TestElement(name) },
})

const deck = Deck.parse({
  title: 'Frames',
  scripts: 'refuse',
  slides: [
    { id: 'one', content: { kind: 'url', src: 'one.html' } },
    { id: 'two', content: { kind: 'url', src: 'two.html' } },
  ],
})

function state(index: number, content: ResolvedContent): DeckState {
  return { ...initialDeckState(), deck, index, slide: deck.slides[index] ?? null, content }
}

function harness(contents: ResolvedContent[], timeout = 10) {
  const host = new TestElement('host')
  host.isConnected = true
  const errors: Error[] = []
  const pool = new FramePool(host as unknown as HTMLElement, () => {})
  const controller = {
    state: state(0, contents[0] as ResolvedContent),
    url: (path: string) => new URL(path, 'https://example.test/').href,
    contentFor: async (index: number) => contents[index] as ResolvedContent,
    forgetContent: () => {},
  } as unknown as DeckController
  const options = {
    neighbors: true,
    css: '',
    csp: '',
    frameTitle: () => '',
    reducedMotion: true,
    bridgeReadyTimeoutMs: timeout,
    reportError: (error: Error) => errors.push(error),
  }
  return { host, pool, controller, options, errors }
}

test('a pooled url frame survives a fresh src with the same reuse key', async () => {
  const one = { kind: 'url' as const, src: 'ticket-1', reuseKey: 'one' }
  const two = { kind: 'url' as const, src: 'ticket-2', reuseKey: 'two' }
  const { pool, controller, options } = harness([one, two])
  pool.update(state(0, one), controller, options)
  await Promise.resolve()
  for (const frame of pool.frames()) (frame as unknown as TestElement).dispatch('load')
  const original = pool.frames()[0]
  pool.update(state(1, two), controller, options)
  pool.update(state(0, { ...one, src: 'ticket-3' }), controller, options)
  expect(pool.frames().find((frame) => frame.closest('[data-slide-id="one"]'))).toBe(original)
})

test('an evicted neighbor resolves afresh when its frame is rebuilt', async () => {
  const slides = Deck.parse({
    title: 'Six frames',
    scripts: 'refuse',
    slides: Array.from({ length: 6 }, (_, index) => ({
      id: `slide-${index + 1}`,
      content: { kind: 'url' as const, src: `slide-${index + 1}.html` },
    })),
  })
  const host = new TestElement('host')
  host.isConnected = true
  const pool = new FramePool(host as unknown as HTMLElement, () => {})
  const counts = new Map<string, number>()
  const prefetched = new Map<string, Promise<ResolvedContent>>()
  const resolveFresh = (index: number): ResolvedContent => {
    const id = slides.slides[index]?.id as string
    const count = (counts.get(id) ?? 0) + 1
    counts.set(id, count)
    return { kind: 'url', src: `${id}-${count}.html` }
  }
  const contentFor = (index: number) => {
    const id = slides.slides[index]?.id as string
    let ready = prefetched.get(id)
    if (!ready) {
      ready = Promise.resolve(resolveFresh(index))
      prefetched.set(id, ready)
    }
    return ready
  }
  let controllerState = initialDeckState()
  const controller = {
    get state() {
      return controllerState
    },
    url: (path: string) => new URL(path, 'https://example.test/').href,
    contentFor,
    forgetContent: (id: string) => prefetched.delete(id),
  } as unknown as DeckController
  const options = {
    neighbors: true,
    css: '',
    csp: '',
    frameTitle: () => '',
    reducedMotion: true,
    bridgeReadyTimeoutMs: 10,
    reportError: () => {},
  }
  const show = async (index: number) => {
    const id = slides.slides[index]?.id as string
    const ready = prefetched.get(id)
    prefetched.delete(id)
    const content = await (ready ?? Promise.resolve(resolveFresh(index)))
    controllerState = { ...initialDeckState(), deck: slides, index, slide: slides.slides[index] ?? null, content }
    pool.update(controllerState, controller, options)
    await Promise.resolve()
    for (const frame of pool.frames()) (frame as unknown as TestElement).dispatch('load')
  }

  await show(3)
  await show(4)
  await show(3)

  expect(counts.get('slide-3')).toBe(2)
  const rebuilt = pool.frames().find((frame) => frame.closest('[data-slide-id="slide-3"]')) as unknown as TestElement
  expect((rebuilt as unknown as { src: string }).src).toBe('https://example.test/slide-3-2.html')
  expect(counts.get('slide-5')).toBe(1)
})

test('bridge-declared url frames report missing ready and accept ready from their own window', async () => {
  const content = { kind: 'url' as const, src: 'slide.html', bridge: true as const }
  const missing = harness([content], 2)
  missing.pool.update(state(0, content), missing.controller, missing.options)
  ;(missing.pool.frames()[0] as unknown as TestElement).dispatch('load')
  await Bun.sleep(5)
  expect(missing.errors[0]?.message).toContain('Slide "one"')
  expect(missing.errors[0]?.message).toContain('did not report ready')

  const ready = harness([content], 2)
  ready.pool.update(state(0, content), ready.controller, ready.options)
  const frame = ready.pool.frames()[0] as unknown as TestElement
  frame.dispatch('load')
  ready.pool.markReady(frame.contentWindow as unknown as MessageEventSource)
  await Bun.sleep(5)
  expect(ready.errors).toEqual([])
})

test('url frames without a bridge declaration and removed frames do not report readiness errors', async () => {
  const plain = { kind: 'url' as const, src: 'plain.html' }
  const unbridged = harness([plain], 2)
  unbridged.pool.update(state(0, plain), unbridged.controller, unbridged.options)
  ;(unbridged.pool.frames()[0] as unknown as TestElement).dispatch('load')

  const bridged = { kind: 'url' as const, src: 'bridged.html', bridge: true as const }
  const removed = harness([bridged], 2)
  removed.pool.update(state(0, bridged), removed.controller, removed.options)
  ;(removed.pool.frames()[0] as unknown as TestElement).dispatch('load')
  removed.pool.clear()
  await Bun.sleep(5)
  expect(unbridged.errors).toEqual([])
  expect(removed.errors).toEqual([])
})

test('released readiness waits do not report errors', async () => {
  const content = { kind: 'url' as const, src: 'slide.html', bridge: true as const }
  const released = harness([content], 2)
  released.pool.update(state(0, content), released.controller, released.options)
  ;(released.pool.frames()[0] as unknown as TestElement).dispatch('load')
  released.pool.releaseWaits()
  await Bun.sleep(5)
  expect(released.errors).toEqual([])
})
