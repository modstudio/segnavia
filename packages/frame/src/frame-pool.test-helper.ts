import { Deck } from '@segnavia/format'
import type { DeckController, DeckState, ResolvedContent } from './controller.ts'
import { initialDeckState } from './controller-types.ts'
import { FramePool } from './frame-pool.ts'
import type { PoolOptions } from './frame-pool-options.ts'

type Listener = () => void

export class FramePoolTestElement {
  className = ''
  dataset: Record<string, string> = {}
  style = { setProperty() {}, removeProperty() {} }
  part = { add() {} }
  title = ''
  srcdoc = ''
  inert = false
  isConnected = false
  contentWindow: Record<string, never> | null = null
  private attributes = new Map<string, string>()
  private children: FramePoolTestElement[] = []
  private listeners = new Map<string, Listener[]>()
  private parent: FramePoolTestElement | null = null

  constructor(readonly tagName: string) {
    if (tagName === 'iframe') this.contentWindow = {}
  }

  append(child: FramePoolTestElement) {
    child.parent = this
    child.connect(this.isConnected)
    this.children.push(child)
  }

  replaceChildren() {
    for (const child of this.children) child.connect(false)
    this.children = []
  }

  replaceWith(replacement: FramePoolTestElement) {
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
    this.attributes.set(name, value)
    if (name.startsWith('data-')) this.dataset[dataKey(name)] = value
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
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

  querySelector(selector: string): FramePoolTestElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }

  querySelectorAll(selector: string): FramePoolTestElement[] {
    if (selector.includes(' ')) {
      const [parent, child] = selector.split(' ')
      return this.descendants()
        .filter((candidate) => candidate.matches(parent ?? ''))
        .flatMap((candidate) => candidate.querySelectorAll(child ?? ''))
    }
    return this.descendants().filter((candidate) => candidate.matches(selector))
  }

  closest(selector: string): FramePoolTestElement | null {
    const slideId = selector.match(/^\[data-slide-id="(.+)"\]$/)?.[1]
    let candidate: FramePoolTestElement | null = this
    while (candidate) {
      if ((slideId && candidate.dataset.slideId === slideId) || candidate.matches(selector)) return candidate
      candidate = candidate.parent
    }
    return null
  }

  private descendants(): FramePoolTestElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()])
  }

  private matches(selector: string): boolean {
    if (selector === 'iframe') return this.tagName === 'iframe'
    if (selector === 'img') return this.tagName === 'img'
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

// Test files share one process, so the stub document is installed for a file's tests and then removed:
// a module another file loads later would otherwise read the stub as the real document.
export function installFramePoolTestDocument(): () => void {
  const previous = { document: Reflect.get(globalThis, 'document'), window: Reflect.get(globalThis, 'window') }
  Object.assign(globalThis, { document: { createElement: (name: string) => new FramePoolTestElement(name) }, window: {} })
  return () => Object.assign(globalThis, previous)
}

export type FrameEvent = { kind: 'mounted' | 'released'; slideId: string; content: ResolvedContent; connected?: boolean }

const deck = Deck.parse({
  title: 'Frames',
  scripts: 'refuse',
  slides: [
    { id: 'one', content: { kind: 'url', src: 'one.html' } },
    { id: 'two', content: { kind: 'url', src: 'two.html' } },
  ],
})

export function state(index: number, content: ResolvedContent): DeckState {
  return { ...initialDeckState(), deck, index, slide: deck.slides[index] ?? null, content }
}

export function harness(contents: ResolvedContent[], timeout = 10) {
  const host = new FramePoolTestElement('host')
  host.isConnected = true
  const errors: Error[] = []
  const events: FrameEvent[] = []
  const pool = new FramePool(host as unknown as HTMLElement, () => {}, {
    mounted: (slideId, content) =>
      events.push({
        kind: 'mounted',
        slideId,
        content,
        connected: host.querySelectorAll('iframe').some((frame) => frame.closest(`[data-slide-id="${slideId}"]`)?.isConnected),
      }),
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
    reportSlideError: (_slideId: string, error: Error) => errors.push(error),
  }
  return { host, pool, controller, options, errors, events }
}
