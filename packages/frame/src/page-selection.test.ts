import { expect, test } from 'bun:test'
import { MESSAGE, SELECTION_TEXT_LIMIT } from './bridge.ts'

class TestElement extends EventTarget {}
const messageListeners = new Set<(event: MessageEvent) => void>()
Object.assign(globalThis, {
  HTMLElement: TestElement,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  window: {
    addEventListener(name: string, listener: (event: MessageEvent) => void) {
      if (name === 'message') messageListeners.add(listener)
    },
    removeEventListener(name: string, listener: (event: MessageEvent) => void) {
      if (name === 'message') messageListeners.delete(listener)
    },
  },
})

const { SegnaviaPage } = await import('./page.ts')

interface TestFrame {
  srcdoc: string
  contentWindow: { postMessage(message: unknown, origin: string): void }
}

function selectionHarness() {
  let frame: TestFrame
  let posts: unknown[] = []
  const page = new SegnaviaPage()
  Object.assign(page, {
    isConnected: true,
    dataset: {},
    style: { removeProperty() {}, setProperty() {} },
    fit() {},
    mount(value: unknown) {
      posts = []
      frame = {
        srcdoc: '',
        contentWindow: { postMessage: (message: unknown) => posts.push(message) },
      }
      ;(page as unknown as Record<string, unknown>).pageValue = value
      ;(page as unknown as Record<string, unknown>).frameReady = false
      return frame
    },
    querySelector: (selector: string) => (selector === 'iframe' ? frame : null),
  })
  const dispatch = (source: unknown, data: unknown) => {
    const event = { source, data } as MessageEvent
    ;(page as unknown as { onMessage(event: MessageEvent): void }).onMessage(event)
    for (const listener of [...messageListeners]) listener(event)
  }
  return {
    page,
    dispatch,
    frame: () => frame,
    posts: () => posts,
  }
}

test('a pending selection read is cancelled when load replaces its frame', async () => {
  const harness = selectionHarness()
  harness.page.load({ html: '<p>Old</p>', scripts: 'refuse' })
  const oldFrame = harness.frame()
  harness.dispatch(oldFrame.contentWindow, { type: MESSAGE.ready })
  const pending = harness.page.readSelection().then(
    () => '',
    (error) => (error instanceof Error ? error.message : String(error)),
  )
  const { id } = harness.posts()[0] as { id: number }
  harness.page.load({ html: '<p>New</p>', scripts: 'refuse' })
  harness.dispatch(oldFrame.contentWindow, { type: MESSAGE.selection, id, text: 'Old', pageText: 'Old' })
  expect(await pending).toContain('page changed before it replied')
})

test('an oversize selection reply is refused', async () => {
  const harness = selectionHarness()
  harness.page.load({ html: '<p>Page</p>', scripts: 'refuse' })
  harness.dispatch(harness.frame().contentWindow, { type: MESSAGE.ready })
  const pending = harness.page.readSelection().then(
    () => '',
    (error) => (error instanceof Error ? error.message : String(error)),
  )
  const { id } = harness.posts()[0] as { id: number }
  harness.dispatch(harness.frame().contentWindow, {
    type: MESSAGE.selection,
    id,
    text: 'x'.repeat(SELECTION_TEXT_LIMIT + 1),
    pageText: 'Page',
  })
  expect(await pending).toContain(`${SELECTION_TEXT_LIMIT}-unit limit`)
})

test('a selection request waits for the mounted frame ready message', async () => {
  const harness = selectionHarness()
  harness.page.load({ html: '<p>Page</p>', scripts: 'refuse' })
  const pending = harness.page.readSelection()
  expect(harness.posts()).toEqual([])
  harness.dispatch(harness.frame().contentWindow, { type: MESSAGE.ready })
  expect(harness.posts()).toHaveLength(1)
  const { id } = harness.posts()[0] as { id: number }
  harness.dispatch(harness.frame().contentWindow, { type: MESSAGE.selection, id, text: '', pageText: 'Page' })
  expect(await pending).toEqual({ text: '', pageText: 'Page' })
})
