import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import type { DeckController, DeckState, ResolvedContent } from './controller.ts'
import { initialDeckState } from './controller-types.ts'
import { FramePool } from './frame-pool.ts'
import type { PoolOptions } from './frame-pool-options.ts'

type Listener = () => void
type FrameEvent = { kind: 'mounted' | 'released'; slideId: string; content: ResolvedContent }

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

Object.assign(globalThis, { document: { createElement: (name: string) => new TestElement(name) }, window: {} })

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
  const events: FrameEvent[] = []
  const pool = new FramePool(host as unknown as HTMLElement, () => {}, {
    mounted: (slideId, content) => events.push({ kind: 'mounted', slideId, content }),
    released: (slideId, content) => events.push({ kind: 'released', slideId, content }),
  })
  const controller = {
    state: state(0, contents[0] as ResolvedContent),
    url: (path: string) => new URL(path, 'https://example.test/').href,
    contentFor: async (index: number) => contents[index] as ResolvedContent,
    forgetContent: () => {},
  } as unknown as DeckController
  const options: PoolOptions = {
    neighbors: true,
    css: '',
    csp: '',
    frameTitle: () => '',
    reducedMotion: true,
    bridgeReadyTimeoutMs: timeout,
    reportSlideError: (_slideId: string, message: string) => errors.push(new Error(message)),
  }
  return { host, pool, controller, options, errors, events }
}

function countingHarness(initialDeck: ReturnType<typeof Deck.parse>) {
  const host = new TestElement('host')
  host.isConnected = true
  const events: FrameEvent[] = []
  const pool = new FramePool(host as unknown as HTMLElement, () => {}, {
    mounted: (slideId, content) => events.push({ kind: 'mounted', slideId, content }),
    released: (slideId, content) => events.push({ kind: 'released', slideId, content }),
  })
  const counts = new Map<string, number>()
  const prefetched = new Map<string, Promise<ResolvedContent>>()
  let slides = initialDeck
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
    reportSlideError: () => {},
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
  const reload = async (nextDeck: ReturnType<typeof Deck.parse>, index: number) => {
    prefetched.clear()
    slides = nextDeck
    await show(index)
  }
  return { counts, events, pool, reload, show }
}

test('a pooled url frame survives a fresh src with the same reuse key without lifecycle events', async () => {
  const one = { kind: 'url' as const, src: 'ticket-1', reuseKey: 'one' }
  const two = { kind: 'url' as const, src: 'ticket-2', reuseKey: 'two' }
  const { pool, controller, options, events } = harness([one, two])
  pool.update(state(0, one), controller, options)
  await Promise.resolve()
  for (const frame of pool.frames()) (frame as unknown as TestElement).dispatch('load')
  const original = pool.frames()[0]
  pool.update(state(1, two), controller, options)
  const beforeReuse = events.length
  pool.update(state(0, { ...one, src: 'ticket-3' }), controller, options)
  expect(pool.frames().find((frame) => frame.closest('[data-slide-id="one"]'))).toBe(original)
  expect(events).toHaveLength(beforeReuse)
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
  const { counts, events, pool, show } = countingHarness(slides)

  await show(3)
  await show(4)
  await show(3)

  expect(counts.get('slide-3')).toBe(2)
  const rebuilt = pool.frames().find((frame) => frame.closest('[data-slide-id="slide-3"]')) as unknown as TestElement
  expect((rebuilt as unknown as { src: string }).src).toBe('https://example.test/slide-3-2.html')
  expect(counts.get('slide-5')).toBe(1)
  const first = events.find((event) => event.kind === 'mounted' && event.slideId === 'slide-3') as FrameEvent
  expect(events.find((event) => event.kind === 'released' && event.slideId === 'slide-3')?.content).toBe(first.content)
  pool.clear()
  const mounts = events.filter((event) => event.kind === 'mounted')
  expect(events.filter((event) => event.kind === 'released')).toHaveLength(mounts.length)
  for (const mount of mounts) expect(events.filter((event) => event.kind === 'released' && event.content === mount.content)).toHaveLength(1)
})

test('a superseded neighbor resolution produces no lifecycle event', async () => {
  const shown = { kind: 'url' as const, src: 'shown.html' }
  const superseded = { kind: 'url' as const, src: 'superseded.html' }
  const selected = { kind: 'url' as const, src: 'selected.html' }
  const pending = Promise.withResolvers<ResolvedContent>()
  const { controller, events, options, pool } = harness([shown, superseded])
  controller.contentFor = async () => pending.promise
  pool.update(state(0, shown), controller, options)
  pool.update(state(1, selected), controller, options)
  pending.resolve(superseded)
  await Promise.resolve()
  expect(events.some((event) => event.content === superseded)).toBeFalse()
})

test('replacing a neighbor keeps the resolution used by its new frame cached', async () => {
  const slides = Deck.parse({
    title: 'Six frames',
    scripts: 'refuse',
    slides: Array.from({ length: 6 }, (_, index) => ({
      id: `slide-${index + 1}`,
      content: { kind: 'url' as const, src: `slide-${index + 1}.html` },
    })),
  })
  const reloaded = Deck.parse({
    title: 'Six reloaded frames',
    scripts: 'refuse',
    slides: Array.from({ length: 6 }, (_, index) => ({
      id: `slide-${index + 1}`,
      content: { kind: 'url' as const, src: `reloaded-${index + 1}.html` },
    })),
  })
  const { counts, events, pool, reload, show } = countingHarness(slides)

  await show(3)
  await reload(reloaded, 3)
  const replaced = pool.frames().find((frame) => frame.closest('[data-slide-id="slide-5"]')) as unknown as TestElement
  expect((replaced as unknown as { src: string }).src).toBe('https://example.test/slide-5-2.html')
  await show(4)

  expect(counts.get('slide-5')).toBe(2)
  const slideFive = events.filter((event) => event.slideId === 'slide-5')
  expect(slideFive.map((event) => event.kind)).toEqual(['mounted', 'released', 'mounted'])
  expect(slideFive[1]?.content).toBe(slideFive[0]?.content)
  expect(slideFive[2]?.content).not.toBe(slideFive[0]?.content)
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

test('shown-slide frame selection waits for load and bridge readiness', () => {
  const html = { kind: 'html' as const, html: '<p>Slide</p>' }
  const htmlHarness = harness([html])
  htmlHarness.pool.update(state(0, html), htmlHarness.controller, htmlHarness.options)
  const htmlFrame = htmlHarness.pool.shownFrame('one') as unknown as TestElement
  let htmlReady = false
  htmlHarness.pool.waitForActiveFrame(htmlFrame as unknown as HTMLIFrameElement, () => {
    htmlReady = true
  })
  expect(htmlReady).toBeFalse()
  htmlFrame.dispatch('load')
  expect(htmlReady).toBeTrue()

  const url = { kind: 'url' as const, src: 'slide.html', bridge: true as const, scripts: 'refuse' as const }
  const urlHarness = harness([url])
  urlHarness.pool.update(state(0, url), urlHarness.controller, urlHarness.options)
  const urlFrame = urlHarness.pool.shownFrame('one') as unknown as TestElement
  let urlReady = false
  urlHarness.pool.waitForActiveFrame(urlFrame as unknown as HTMLIFrameElement, () => {
    urlReady = true
  })
  urlFrame.dispatch('load')
  expect(urlReady).toBeFalse()
  urlHarness.pool.markReady(urlFrame.contentWindow as unknown as MessageEventSource)
  expect(urlReady).toBeTrue()
})

test('a pending turn has a mounted frame for its incoming slide', () => {
  Object.assign(window, { clearTimeout, setTimeout })
  const one = { kind: 'url' as const, src: 'one.html' }
  const two = { kind: 'url' as const, src: 'two.html' }
  const { pool, controller, options } = harness([one, two])
  options.reducedMotion = false
  options.transition = { kind: 'fade', duration: 100 }
  pool.update(state(0, one), controller, options)
  ;(controller as unknown as { state: DeckState }).state = state(1, two)
  pool.update(controller.state, controller, options)

  expect(pool.shownFrame('two')).toBeNull()
  expect(pool.hasMountedFrame('two')).toBeTrue()
  pool.clear()
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
