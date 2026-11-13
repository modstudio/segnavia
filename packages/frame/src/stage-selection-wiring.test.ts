import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { MESSAGE } from './bridge.ts'
import type { DeckState } from './controller.ts'
import { initialDeckState } from './controller-types.ts'
import { DeckRefusedError, SlideRefusedError } from './deck-refusal.ts'
import { BridgeReadyTimeoutError, FrameEntry } from './frame-entry.ts'
import { SlideFrameError } from './slide-frame-error.ts'

type MessageListener = (event: MessageEvent) => void

const messageListeners = new Set<MessageListener>()

class TestElement extends EventTarget {
  dataset: Record<string, string> = {}
  style = { setProperty() {}, removeProperty() {} }
  isConnected = false
  private attributes = new Map<string, string>()

  hasAttribute(name: string) {
    return this.attributes.has(name)
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }

  toggleAttribute(name: string, force: boolean) {
    if (force) this.setAttribute(name, '')
    else this.removeAttribute(name)
  }

  querySelector() {
    return null
  }

  querySelectorAll() {
    return []
  }
}

Object.assign(globalThis, {
  HTMLElement: TestElement,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  matchMedia: () => ({ matches: false }),
  window: {
    addEventListener(name: string, listener: MessageListener) {
      if (name === 'message') messageListeners.add(listener)
    },
    removeEventListener(name: string, listener: MessageListener) {
      if (name === 'message') messageListeners.delete(listener)
    },
    visualViewport: { addEventListener() {}, removeEventListener() {} },
  },
})

const { SegnaviaStage } = await import('./stage.ts')
type Stage = InstanceType<typeof SegnaviaStage>

function selectionState(scripts: 'refuse' | 'sandboxed', id = 'one'): DeckState {
  const content = { kind: 'html' as const, html: `<p>${id}</p>` }
  const deck = Deck.parse({
    title: 'Selection',
    size: { width: 400, height: 200 },
    scripts,
    slides: [{ id, content }],
  })
  const slide = deck.slides[0]
  if (!slide) throw new Error('Expected a slide.')
  return { ...initialDeckState(), deck, slide, content }
}

function harness(scripts: 'refuse' | 'sandboxed' = 'refuse') {
  const posts: Array<{ type: string; id: number }> = []
  const contentWindow = { postMessage: (message: { type: string; id: number }) => posts.push(message) }
  const frame = { contentWindow } as unknown as HTMLIFrameElement
  let ready: (() => void) | undefined
  let shownFrame: HTMLIFrameElement | null = frame
  const stage = new SegnaviaStage() as Stage & Record<string, unknown>
  const state = selectionState(scripts)
  Object.assign(stage, {
    dataset: {},
    attached: { state, addEventListener() {}, removeEventListener() {} },
    pool: {
      activeFrame: () => frame,
      shownFrame: () => shownFrame,
      waitForActiveFrame(_frame: HTMLIFrameElement, post: () => void) {
        ready = post
        return () => {
          ready = undefined
        }
      },
      clear() {},
      cancelPending() {},
      releaseWaits() {},
    },
    frameRebuilder: { rebuild() {} },
    update() {},
  })
  const dispatch = (source: unknown, data: unknown) => {
    for (const listener of [...messageListeners]) listener({ source, data } as MessageEvent)
  }
  return { contentWindow, dispatch, frame, posts, setPending: () => (shownFrame = null), stage, state, takeReady: () => ready }
}

test('stage selection follows the shown slide, readiness, and lifecycle cancellation', async () => {
  const sandboxed = harness('sandboxed')
  await expect(sandboxed.stage.readSelection()).rejects.toThrow('while author scripts run')
  expect(sandboxed.posts).toEqual([])

  const refused = harness()
  const selected = refused.stage.readSelection()
  expect(refused.posts).toEqual([])
  refused.takeReady()?.()
  expect(refused.posts).toHaveLength(1)
  refused.dispatch(refused.contentWindow, {
    type: MESSAGE.selection,
    id: refused.posts[0]?.id,
    text: 'Selection',
    pageText: 'Shown slide',
  })
  expect(await selected).toEqual({ text: 'Selection', pageText: 'Shown slide' })

  const turning = harness()
  turning.setPending()
  await expect(turning.stage.readSelection()).rejects.toThrow('no frame is mounted')
  expect(turning.posts).toEqual([])

  const changed = harness()
  const changedRead = changed.stage.readSelection()
  ;(changed.stage as unknown as { onChange(event: CustomEvent): void }).onChange(new CustomEvent('change', { detail: selectionState('refuse', 'two') }))
  await expect(changedRead).rejects.toThrow('slide changed before it replied')

  const replaced = harness()
  const replacedRead = replaced.stage.readSelection()
  replaced.stage.controller = {
    state: initialDeckState(),
    connectWindow() {},
    disconnectWindow() {},
    addEventListener() {},
    removeEventListener() {},
  } as never
  await expect(replacedRead).rejects.toThrow('slide changed before it replied')

  const disconnected = harness()
  const disconnectedRead = disconnected.stage.readSelection()
  Object.assign(disconnected.stage, { attached: null })
  disconnected.stage.disconnectedCallback()
  await expect(disconnectedRead).rejects.toThrow('slide changed before it replied')
})

class TestController extends EventTarget {
  constructor(public state: DeckState) {
    super()
  }
  connectWindow() {}
  disconnectWindow() {}
}

test('stage refusal wiring follows controller, content, and frame recovery', () => {
  const stage = new SegnaviaStage() as Stage & Record<string, unknown>
  Object.assign(stage, { dataset: {}, frameRebuilder: { rebuild() {} } })
  let changes = 0
  stage.addEventListener('refusalchange', () => changes++)
  const first = new TestController(selectionState('refuse'))
  stage.controller = first as never

  const deckRefusal = new DeckRefusedError(new Error('invalid'))
  first.dispatchEvent(new ErrorEvent('error', { error: deckRefusal, message: deckRefusal.message }))
  expect(stage.refusal).toBe(deckRefusal)
  expect(stage.dataset.refused).toBe('deck')

  stage.controller = null
  expect(stage.refusal).toBeNull()
  expect(stage.dataset.refused).toBeUndefined()

  const second = new TestController(selectionState('refuse'))
  stage.controller = second as never
  expect(stage.refusal).toBeNull()

  const slideRefusal = new SlideRefusedError(0, 'one', new Error('content failed'))
  second.dispatchEvent(new ErrorEvent('error', { error: slideRefusal, message: slideRefusal.message }))
  expect(stage.refusal).toBe(slideRefusal)
  const refreshed = { ...second.state, content: { kind: 'html' as const, html: '<p>fresh</p>' } }
  Object.assign(stage, { slotDeck: refreshed.deck, resolvedSlots: undefined })
  ;(stage as unknown as { update(state: DeckState): void }).update(refreshed)
  expect(stage.refusal).toBeNull()

  expect(changes).toBe(4)
})

test("a frame's ready window message clears its bridge timeout refusal", () => {
  const content = { kind: 'url' as const, src: 'one.html', bridge: true as const }
  const deck = Deck.parse({ title: 'Ready', scripts: 'refuse', slides: [{ id: 'one', content: { kind: 'url', src: 'one.html' } }] })
  const state = { ...initialDeckState(), deck, slide: deck.slides[0] ?? null, content }
  const entry = new FrameEntry('one', { content, scripts: 'refuse', css: '', cspExtra: '', origins: '' }, content)
  const failure = new SlideFrameError('one', 0, new BridgeReadyTimeoutError('one', 2))
  entry.markFailed(failure)
  const contentWindow = {}
  const frame = { contentWindow } as unknown as HTMLIFrameElement
  const stage = new SegnaviaStage() as Stage & Record<string, unknown>
  Object.assign(stage, {
    dataset: {},
    attached: { state, key() {} },
    slotDeck: deck,
    resolvedSlots: undefined,
    pool: {
      activeFrame: () => frame,
      cancelPending() {},
      clear() {},
      failureFor: (shown: DeckState) => (shown.content === entry.content ? entry.failure : null),
      frames: () => [frame],
      markReady: () => entry.markReady(),
      releaseWaits() {},
      slideIdFor: (source: MessageEventSource | null) => (source === contentWindow ? 'one' : undefined),
    },
  })
  ;(stage as unknown as { update(state: DeckState): void }).update(state)
  expect(stage.refusal).toBe(failure)

  const onMessage = (stage as unknown as { onMessage(event: MessageEvent): void }).onMessage
  messageListeners.add(onMessage)
  for (const listener of [...messageListeners]) listener({ source: contentWindow, data: { type: MESSAGE.ready } } as MessageEvent)

  expect(stage.refusal).toBeNull()
  messageListeners.delete(onMessage)
})
