import { expect, test } from 'bun:test'
import { MESSAGE } from './bridge.ts'
import { initialDeckState } from './controller-types.ts'

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

function selectionState(scripts: 'refuse' | 'sandboxed', id = 'one') {
  const slide = { id, content: { kind: 'html' as const, html: `<p>${id}</p>` } }
  const deck = {
    title: 'Selection',
    size: { width: 400, height: 200 },
    layout: 'slides' as const,
    scripts,
    slides: [slide],
  }
  return { ...initialDeckState(), deck, slide, content: slide.content }
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
