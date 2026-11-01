import { describe, expect, test } from 'bun:test'
import { bridgeForHost, COMPOSE_FAILURE_TEXT_LIMIT, MESSAGE, messageFrom } from './bridge.ts'

function compositionBridge(failureAttribute?: string, reportHeight = false) {
  const attributes = new Map<string, string>()
  const messages: unknown[] = []
  let height = 0
  let changed = () => {}
  let disconnected = false
  const document = {
    readyState: 'complete',
    documentElement: {
      hasAttribute: (name: string) => attributes.has(name),
      getAttribute: (name: string) => attributes.get(name) ?? null,
      getBoundingClientRect: () => ({ height }),
    },
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
    observe() {
      changed = () => this.callback([], this)
    }
    disconnect() {
      disconnected = true
    }
  }
  const timers: Array<() => void> = []
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
    bridgeForHost({ reportHeight, readyAfterAttribute: 'data-done', failureAttribute }),
  )(document, { postMessage: (message: unknown) => messages.push(message) }, window, MutationObserver, window.ResizeObserver, (callback: () => void) =>
    timers.push(callback),
  )
  return {
    attributes,
    messages,
    timers,
    changed,
    setHeight: (value: number) => {
      height = value
    },
    disconnected: () => disconnected,
  }
}

describe('composed frame bridge', () => {
  test('reports ready only after its composer marks the root', async () => {
    const bridge = compositionBridge()
    await Promise.resolve()
    expect(bridge.messages.some((message) => (message as { type?: string }).type === MESSAGE.ready)).toBe(false)
    bridge.attributes.set('data-done', '')
    bridge.changed()
    await Promise.resolve()
    await Promise.resolve()
    expect(bridge.messages.at(-1)).toEqual({ type: MESSAGE.ready })
  })

  test('reports its changed height when the composer marks the root', async () => {
    const bridge = compositionBridge(undefined, true)
    bridge.setHeight(2112)
    bridge.attributes.set('data-done', '')
    bridge.changed()
    bridge.timers.shift()?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(bridge.messages).toContainEqual({ type: MESSAGE.height, height: 2112 })
    const heightReports = bridge.messages.filter((message) => (message as { type?: string }).type === MESSAGE.height)
    bridge.changed()
    bridge.timers.shift()?.()
    expect(bridge.messages.filter((message) => (message as { type?: string }).type === MESSAGE.height)).toEqual(heightReports)
  })

  test('reports a bounded compose failure once and never reports ready', async () => {
    const bridge = compositionBridge('data-failure')
    bridge.attributes.set('data-failure', 'x'.repeat(COMPOSE_FAILURE_TEXT_LIMIT + 20))
    bridge.changed()
    bridge.changed()
    await Promise.resolve()
    await Promise.resolve()
    const failures = bridge.messages.filter((message) => (message as { type?: string }).type === MESSAGE.composeFailure)
    expect(failures).toEqual([{ type: MESSAGE.composeFailure, text: `${'x'.repeat(COMPOSE_FAILURE_TEXT_LIMIT - 1)}…` }])
    expect(bridge.disconnected()).toBe(true)
    expect(bridge.messages.some((message) => (message as { type?: string }).type === MESSAGE.ready)).toBe(false)
  })

  test('accepts only bounded non-empty compose failures from the frame', () => {
    const source = {} as Window
    const frame = { contentWindow: source } as HTMLIFrameElement
    const event = (data: unknown, eventSource: MessageEventSource | null = source) => ({ source: eventSource, data }) as MessageEvent
    const atBound = 'x'.repeat(COMPOSE_FAILURE_TEXT_LIMIT)
    expect(messageFrom(event({ type: MESSAGE.composeFailure, text: atBound }), frame)).toEqual({ type: MESSAGE.composeFailure, text: atBound })
    expect(messageFrom(event({ type: MESSAGE.composeFailure, text: `${atBound}x` }), frame)).toBeNull()
    expect(messageFrom(event({ type: MESSAGE.composeFailure, text: '' }), frame)).toBeNull()
    expect(messageFrom(event({ type: MESSAGE.composeFailure, text: 1 }), frame)).toBeNull()
    expect(messageFrom(event({ type: MESSAGE.composeFailure, text: 'refused' }, {} as Window), frame)).toBeNull()
  })
})
