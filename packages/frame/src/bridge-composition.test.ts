import { describe, expect, test } from 'bun:test'
import { PREFLIGHT_PRESETS } from '@segnavia/format'
import { bridgeForHost, COMPOSE_FAILURE_TEXT_LIMIT, MESSAGE, messageFrom } from './bridge.ts'

function compositionBridge(
  failureAttribute?: string,
  reportHeight: boolean | 'body' = false,
  progressAttribute?: string,
  progressCallback?: string,
  installCallback = true,
) {
  const attributes = new Map<string, string>()
  const messages: unknown[] = []
  let height = 0
  let bodyHeight = 0
  let changed = () => {}
  let resized = () => {}
  let disconnected = false
  const document = {
    readyState: 'complete',
    documentElement: {
      hasAttribute: (name: string) => attributes.has(name),
      getAttribute: (name: string) => attributes.get(name) ?? null,
      getBoundingClientRect: () => ({ height }),
    },
    body: { getBoundingClientRect: () => ({ height: bodyHeight }) },
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
      constructor(callback: () => void) {
        resized = callback
      }
      observe() {}
    },
  }
  if (progressCallback && installCallback) Object.assign(window, { [progressCallback]: (progress: unknown) => messages.push({ callback: progress }) })
  Function(
    'document',
    'parent',
    'window',
    'MutationObserver',
    'ResizeObserver',
    'setTimeout',
    bridgeForHost({ reportHeight, readyAfterAttribute: 'data-done', failureAttribute, progressAttribute, progressCallback }),
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
    setBodyHeight: (value: number) => {
      bodyHeight = value
    },
    resized: () => resized(),
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

  test('starts body height reporting after composition and re-reports body resizes', async () => {
    const bridge = compositionBridge(undefined, 'body')
    bridge.setBodyHeight(900)
    bridge.timers.shift()?.()
    expect(bridge.messages.some((message) => (message as { type?: string }).type === MESSAGE.height)).toBe(false)

    bridge.attributes.set('data-done', '')
    bridge.changed()
    bridge.timers.shift()?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(bridge.messages).toContainEqual({ type: MESSAGE.height, height: 900 })

    bridge.setBodyHeight(720)
    bridge.resized()
    bridge.timers.shift()?.()
    expect(bridge.messages).toContainEqual({ type: MESSAGE.height, height: 720 })
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

  test('relays bounded progress changes while composition is pending', () => {
    const bridge = compositionBridge(undefined, false, 'data-progress')
    bridge.attributes.set('data-progress', '2/5')
    bridge.changed()
    expect(bridge.messages.at(-1)).toEqual({ type: MESSAGE.composeProgress, pages: 2, total: 5 })
    bridge.attributes.set('data-progress', '6/5')
    bridge.changed()
    expect(bridge.messages.at(-1)).toEqual({ type: MESSAGE.composeProgress, pages: 2, total: 5 })
  })

  test('catches removal of the unchanged-progress check by posting one report', () => {
    const bridge = compositionBridge(undefined, false, 'data-progress')
    bridge.attributes.set('data-progress', '2/5')
    bridge.changed()
    bridge.changed()
    expect(bridge.messages.filter((message) => (message as { type?: string }).type === MESSAGE.composeProgress)).toEqual([
      { type: MESSAGE.composeProgress, pages: 2, total: 5 },
    ])
  })

  test('calls an installed progress binding and ignores a missing one', () => {
    const installed = compositionBridge(undefined, false, 'data-progress', 'reportProgress')
    installed.attributes.set('data-progress', '2/5')
    installed.changed()
    expect(installed.messages).toContainEqual({ callback: { pages: 2, total: 5 } })

    const missing = compositionBridge(undefined, false, 'data-progress', 'missingProgress', false)
    missing.attributes.set('data-progress', '2/5')
    expect(() => missing.changed()).not.toThrow()
    expect(missing.messages.at(-1)).toEqual({ type: MESSAGE.composeProgress, pages: 2, total: 5 })
  })

  test('re-bounds compose progress from the frame source', () => {
    const source = {} as Window
    const frame = { contentWindow: source } as HTMLIFrameElement
    const event = (data: unknown) => ({ source, data }) as MessageEvent
    expect(messageFrom(event({ type: MESSAGE.composeProgress, pages: 3, total: 5 }), frame)).toEqual({
      type: MESSAGE.composeProgress,
      pages: 3,
      total: 5,
    })
    for (const progress of [
      { pages: -1, total: 5 },
      { pages: 1.5, total: 5 },
      { pages: 10_001, total: 10_001 },
      { pages: 6, total: 5 },
      { pages: '3', total: 5 },
      { pages: 3 },
    ]) {
      expect(messageFrom(event({ type: MESSAGE.composeProgress, ...progress }), frame)).toBeNull()
    }
  })

  test('accepts and re-bounds preflight only from the frame source', () => {
    const source = {} as Window
    const frame = { contentWindow: source } as HTMLIFrameElement
    const issues = Array.from({ length: 70 }, (_, index) => ({
      check: 'region-overset',
      subject: `${index}${'x'.repeat(300)}`,
      message: 'shorten it',
      severity: 'error',
      id: 'forged',
    }))
    const data = { type: MESSAGE.preflight, report: { issues, omitted: { 'region-overset': 4, unknown: 10 }, facts: { pageCount: 1, pages: [], fits: [] } } }
    const accepted = messageFrom({ source, data } as MessageEvent, frame, PREFLIGHT_PRESETS.default)
    expect(accepted?.report?.issues).toHaveLength(64)
    expect(accepted?.report?.issues[0]?.severity).toBe('warning')
    expect(accepted?.report?.issues[0]?.subject).toHaveLength(256)
    expect(accepted?.report?.issues[0]?.id).toBe(`region-overset:0${'x'.repeat(255)}`)
    expect(accepted?.report?.omitted).toEqual({ 'region-overset': 10 })
    expect(messageFrom({ source: {} as Window, data } as MessageEvent, frame)).toBeNull()
  })

  test('refuses an over-bound book place key', () => {
    const source = {} as Window
    const frame = { contentWindow: source } as HTMLIFrameElement
    expect(messageFrom({ source, data: { type: MESSAGE.bookPlace, key: 'x'.repeat(257) } } as MessageEvent, frame)).toBeNull()
  })
})
