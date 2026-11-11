import { describe, expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { MESSAGE } from './bridge.ts'

class TestElement extends EventTarget {
  dataset: Record<string, string> = {}
  hasAttribute() {
    return false
  }
}

Object.assign(globalThis, {
  HTMLElement: TestElement,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
})

const { SegnaviaPage } = await import('./page.ts')

function frame() {
  const loads: Array<() => void> = []
  return {
    contentWindow: {},
    src: '',
    srcdoc: '',
    addEventListener(type: string, listener: () => void) {
      if (type === 'load') loads.push(listener)
    },
    load(index = loads.length - 1) {
      loads[index]?.()
    },
  }
}

function readyHarness(pageValue = Page.parse({ html: '<p>Screen page</p>' })) {
  const heldFrame = frame()
  const page = new SegnaviaPage()
  const ready: Event[] = []
  const errors: ErrorEvent[] = []
  Object.assign(page, {
    loadGeneration: 1,
    pageValue,
    querySelector: () => heldFrame,
  })
  page.addEventListener('ready', (event) => ready.push(event))
  page.addEventListener('error', (event) => errors.push(event as ErrorEvent))
  const write = (provisional = false) =>
    (page as unknown as { writeDocument(frame: unknown, source: string, provisional?: boolean): void }).writeDocument(
      heldFrame,
      '<!doctype html><p>Written</p>',
      provisional,
    )
  const dispatch = (data: unknown) =>
    (page as unknown as { onMessage(event: MessageEvent): void }).onMessage({ source: heldFrame.contentWindow, data } as MessageEvent)
  return { dispatch, errors, frame: heldFrame, page, ready, write }
}

function printedPage() {
  return Page.parse({
    html: '<p>Printed page</p>',
    print: { paper: 'letter' },
    printedPages: { parents: [{ name: 'body' }], parentRules: [{ parent: 'body' }] },
  })
}

describe('SegnaviaPage ready', () => {
  test('fires once after a screen document has loaded and reports ready', () => {
    const harness = readyHarness()
    harness.write()

    harness.dispatch({ type: MESSAGE.ready })
    expect(harness.ready).toEqual([])
    harness.frame.load()
    harness.dispatch({ type: MESSAGE.ready })
    harness.dispatch({ type: MESSAGE.ready })

    expect(harness.ready).toHaveLength(1)
    expect(harness.ready[0]).toBeInstanceOf(Event)
    expect(harness.ready[0]).not.toBeInstanceOf(CustomEvent)
    expect(harness.ready[0]?.bubbles).toBe(false)
  })

  test('waits through printed composition progress and fires on ready', () => {
    const harness = readyHarness(printedPage())
    Object.assign(harness.page, { composedFrame: { frame: harness.frame, generation: 1 } })
    harness.write()
    harness.frame.load()

    harness.dispatch({ type: MESSAGE.composeProgress, pages: 1, total: 2 })
    harness.dispatch({ type: MESSAGE.composeProgress, pages: 2, total: 2 })
    expect(harness.ready).toEqual([])
    harness.dispatch({ type: MESSAGE.ready })

    expect(harness.ready).toHaveLength(1)
  })

  test('ignores a ready for a superseded write', () => {
    const harness = readyHarness()
    harness.write()
    harness.write()

    harness.frame.load(0)
    harness.dispatch({ type: MESSAGE.ready })
    expect(harness.ready).toEqual([])
    harness.frame.load(1)
    harness.dispatch({ type: MESSAGE.ready })

    expect(harness.ready).toHaveLength(1)
  })

  test('fires only for the final document after slot filling replaces a provisional write', () => {
    const harness = readyHarness()
    harness.write(true)
    harness.frame.load()
    harness.dispatch({ type: MESSAGE.ready })

    expect(harness.ready).toEqual([])

    harness.write()
    harness.frame.load()
    harness.dispatch({ type: MESSAGE.ready })
    harness.dispatch({ type: MESSAGE.ready })

    expect(harness.ready).toHaveLength(1)
  })

  test('reports a compose failure without firing ready', () => {
    const harness = readyHarness(printedPage())
    Object.assign(harness.page, { composedFrame: { frame: harness.frame, generation: 1 } })
    harness.write()
    harness.frame.load()

    harness.dispatch({ type: MESSAGE.composeFailure, text: 'composition failed' })

    expect(harness.errors.map((event) => event.message)).toEqual(['composition failed'])
    expect(harness.ready).toEqual([])
  })
})
