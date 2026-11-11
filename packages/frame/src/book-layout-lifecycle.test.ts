import { describe, expect, test } from 'bun:test'
import { reflectedBookElement, switchableBookView } from './book-test-view.ts'
import { MESSAGE } from './bridge.ts'

describe('book layout lifecycle', () => {
  test('a current frame font report dispatches a bubbling composed event', () => {
    const { book, frames } = reflectedBookElement()
    book.view = switchableBookView()
    const frame = frames[0]
    if (!frame) throw new Error('the book frame was not mounted')
    const seen: Array<{ failures: unknown; bubbles: boolean; composed: boolean }> = []
    book.dispatchEvent = ((event: Event) => {
      if (event.type === 'fontfailure') seen.push({ failures: (event as CustomEvent).detail.failures, bubbles: event.bubbles, composed: event.composed })
      return true
    }) as typeof book.dispatchEvent
    const failure = { font: 'body', family: 'Body', reason: 'unloaded' }
    const onMessage = (book as unknown as { onMessage(event: MessageEvent): void }).onMessage
    const generation = String((book as unknown as { loadGeneration: number }).loadGeneration)
    frame.dataset.segnaviaBookGeneration = '-1'
    onMessage({ source: frame.contentWindow, data: { type: MESSAGE.fontFailures, failures: [failure] } } as MessageEvent)
    frame.dataset.segnaviaBookGeneration = generation
    onMessage({ source: frame.contentWindow, data: { type: MESSAGE.fontFailures, failures: [failure] } } as MessageEvent)
    expect(seen).toEqual([{ failures: [failure], bubbles: true, composed: true }])
  })

  test('a preflight report dispatches only from the current composing frame', () => {
    const { book, frames } = reflectedBookElement()
    book.view = switchableBookView()
    const frame = frames[0]
    if (!frame) throw new Error('the book frame was not mounted')
    const seen: unknown[] = []
    book.dispatchEvent = ((event: Event) => {
      if (event.type === 'preflight') seen.push((event as CustomEvent).detail)
      return true
    }) as typeof book.dispatchEvent
    const report = { status: 'clean', issues: [], omitted: {}, facts: { pageCount: 1, pages: [], fits: [] }, coverage: { measured: 1, total: 1 } }
    const onMessage = (book as unknown as { onMessage(event: MessageEvent): void }).onMessage
    const generation = String((book as unknown as { loadGeneration: number }).loadGeneration)
    frame.dataset.segnaviaBookGeneration = '-1'
    onMessage({ source: frame.contentWindow, data: { type: MESSAGE.preflight, report } } as MessageEvent)
    frame.dataset.segnaviaBookGeneration = generation
    onMessage({ source: frame.contentWindow, data: { type: MESSAGE.preflight, report } } as MessageEvent)
    expect(seen).toEqual([report])
  })

  test('compose progress dispatches only from the current paginated frame', () => {
    const { book, frames } = reflectedBookElement()
    book.view = switchableBookView()
    const frame = frames[0]
    if (!frame) throw new Error('the book frame was not mounted')
    const seen: unknown[] = []
    book.dispatchEvent = ((event: Event) => {
      if (event.type === 'composeprogress') seen.push((event as CustomEvent).detail)
      return true
    }) as typeof book.dispatchEvent
    const onMessage = (book as unknown as { onMessage(event: MessageEvent): void }).onMessage
    const generation = String((book as unknown as { loadGeneration: number }).loadGeneration)
    const progress = { source: frame.contentWindow, data: { type: MESSAGE.composeProgress, pages: 2, total: 5 } } as MessageEvent
    frame.dataset.segnaviaBookGeneration = '-1'
    onMessage(progress)
    frame.dataset.segnaviaBookGeneration = generation
    onMessage(progress)
    frame.dataset.segnaviaBookLayout = 'flow'
    onMessage(progress)
    expect(seen).toEqual([{ pages: 2, total: 5 }])
  })

  test('a reloaded frame keeps its intrinsic layout and detach clears readiness', () => {
    const { book, frames } = reflectedBookElement()
    const messages: unknown[] = []
    ;(book as unknown as { dispatchEvent: () => boolean }).dispatchEvent = () => true
    book.layout = 'flow'
    book.view = switchableBookView()
    const frame = frames.find((held) => held.dataset.segnaviaBookLayout === 'flow')
    if (!frame) throw new Error('flow frame was not mounted')
    Object.defineProperty(frame, 'contentWindow', {
      configurable: true,
      value: {
        postMessage(value: unknown) {
          messages.push(value)
        },
      },
    })
    ;(book as unknown as { readyLayouts: Set<string> }).readyLayouts.add('flow')

    const previousWindow = globalThis.window
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { removeEventListener() {} },
    })
    book.disconnectedCallback()
    globalThis.window = previousWindow
    expect((book as unknown as { readyLayouts: Set<string> }).readyLayouts.size).toBe(0)
    ;(book as unknown as { onMessage: (event: MessageEvent) => void }).onMessage({
      source: frame.contentWindow,
      data: { type: 'segnavia:ready' },
    } as unknown as MessageEvent)
    expect(messages).toEqual([])
  })

  test('a missing flow view refuses flow but preserves the request for a later capable view', () => {
    const { book, attributes } = reflectedBookElement()
    const errors: string[] = []
    book.dispatchEvent = ((event: Event) => {
      if (event.type === 'error') errors.push((event as CustomEvent<{ message: string }>).detail.message)
      return true
    }) as typeof book.dispatchEvent
    const withoutFlow = switchableBookView()
    delete withoutFlow.flow
    book.view = withoutFlow

    book.layout = 'flow'
    expect(book.layout as string).toBe('pages')
    expect(attributes.has('layout')).toBe(false)
    expect(errors).toEqual(['This book has no flow view; supply a view built with its flow to use layout "flow".'])

    book.view = switchableBookView()
    expect(book.layout).toBe('flow')
    expect(attributes.get('layout')).toBe('flow')
  })

  test('a flow request made before a flowless view arrives is refused and preserved', () => {
    const { book, attributes } = reflectedBookElement()
    const errors: string[] = []
    book.dispatchEvent = ((event: Event) => {
      if (event.type === 'error') errors.push((event as CustomEvent<{ message: string }>).detail.message)
      return true
    }) as typeof book.dispatchEvent

    book.layout = 'flow'
    const withoutFlow = switchableBookView()
    delete withoutFlow.flow
    book.view = withoutFlow

    expect(book.layout as string).toBe('pages')
    expect(attributes.get('layout')).toBe('pages')
    expect(errors).toEqual(['This book has no flow view; supply a view built with its flow to use layout "flow".'])

    book.view = switchableBookView()
    expect(book.layout).toBe('flow')
    expect(attributes.get('layout')).toBe('flow')
  })

  test('a layout change posts once when its lazily mounted frame becomes ready', async () => {
    const { book, frames } = reflectedBookElement()
    const messages: Array<{ value: unknown; origin: string }> = []
    ;(book as unknown as { dispatchEvent: () => boolean }).dispatchEvent = () => true
    book.view = switchableBookView()
    await book.attributeChangedCallback('layout', null, 'flow')
    const flow = frames.find((frame) => frame.dataset.segnaviaBookLayout === 'flow')
    if (!flow) throw new Error('flow frame was not mounted lazily')
    Object.defineProperty(flow, 'contentWindow', {
      configurable: true,
      value: { postMessage: (value: unknown, origin: string) => messages.push({ value, origin }) },
    })
    ;(book as unknown as { onMessage: (event: MessageEvent) => void }).onMessage({
      source: flow.contentWindow,
      data: { type: 'segnavia:ready' },
    } as unknown as MessageEvent)
    expect(messages).toEqual([{ value: { type: 'segnavia:book-layout', layout: 'flow' }, origin: '*' }])
  })

  test('a layout change before readiness lazily mounts the chosen flow document', async () => {
    const { book, frames } = reflectedBookElement()
    book.view = switchableBookView()
    await book.attributeChangedCallback('layout', null, 'flow')
    expect(frames.map((frame) => frame.dataset.segnaviaBookLayout)).toEqual(['pages', 'flow'])
    expect(frames[1]?.srcdoc).toContain('data-segnavia-flow="chapter"')
    expect(frames[1]?.srcdoc).not.toContain('data-segnavia-galleys')
  })

  test('a ready layout reports its current place before the target is shown', () => {
    const { book, frames } = reflectedBookElement()
    const pagesMessages: unknown[] = []
    const flowMessages: unknown[] = []
    ;(book as unknown as { dispatchEvent: () => boolean }).dispatchEvent = () => true
    book.view = switchableBookView()
    const pages = frames[0]
    if (!pages) throw new Error('pages frame was not mounted')
    Object.defineProperty(pages, 'contentWindow', {
      configurable: true,
      value: { postMessage: (value: unknown) => pagesMessages.push(value) },
    })
    ;(book as unknown as { readyLayouts: Set<string> }).readyLayouts.add('pages')

    book.layout = 'flow'
    const flow = frames[1]
    if (!flow) throw new Error('flow frame was not mounted')
    expect(frames.filter((frame) => !frame.hidden).map((frame) => frame.dataset.segnaviaBookLayout)).toEqual(['pages'])
    expect(pagesMessages).toEqual([{ type: 'segnavia:book-layout', layout: 'flow' }])

    ;(book as unknown as { onMessage: (event: MessageEvent) => void }).onMessage({
      source: pages.contentWindow,
      data: { type: 'segnavia:book-place', key: 'chapter:3' },
    } as unknown as MessageEvent)
    expect(frames.filter((frame) => !frame.hidden).map((frame) => frame.dataset.segnaviaBookLayout)).toEqual(['flow'])
    Object.defineProperty(flow, 'contentWindow', {
      configurable: true,
      value: { postMessage: (value: unknown) => flowMessages.push(value) },
    })
    ;(book as unknown as { onMessage: (event: MessageEvent) => void }).onMessage({
      source: flow.contentWindow,
      data: { type: 'segnavia:ready' },
    } as unknown as MessageEvent)
    expect(flowMessages).toEqual([{ type: 'segnavia:book-layout', layout: 'flow', place: 'chapter:3' }])
  })

  test('a switch to flow while fonts resolve shows flow after they resolve', async () => {
    const { book, frames } = reflectedBookElement()
    ;(book as unknown as { dispatchEvent: () => boolean }).dispatchEvent = () => true
    Object.defineProperty(book, 'isConnected', { configurable: true, value: true })
    ;(book as unknown as { fontOptions: unknown }).fontOptions = { source: { kind: 'none' } }
    book.view = switchableBookView()
    await book.attributeChangedCallback('layout', null, 'flow')
    await new Promise((resolve) => setTimeout(resolve, 20))
    const shown = frames.filter((frame) => !frame.hidden).map((frame) => frame.dataset.segnaviaBookLayout)
    expect(book.layout).toBe('flow')
    expect(shown).toEqual(['flow'])
  })

  test('place reports are accepted only from their frame with a bounded position key', () => {
    const { book, frames } = reflectedBookElement()
    book.view = switchableBookView()
    const pages = frames[0]
    if (!pages) throw new Error('pages frame was not mounted')
    const onMessage = (source: unknown, key: unknown) =>
      (book as unknown as { onMessage: (event: MessageEvent) => void }).onMessage({
        source,
        data: { type: 'segnavia:book-place', key },
      } as unknown as MessageEvent)
    onMessage({}, 'chapter:1')
    onMessage(pages.contentWindow, 'not-a-position')
    onMessage(pages.contentWindow, `${'x'.repeat(256)}:1`)
    expect((book as unknown as { places: Map<string, string> }).places.size).toBe(0)
    onMessage(pages.contentWindow, 'chapter:2:footnotes')
    expect((book as unknown as { places: Map<string, string> }).places).toEqual(new Map([['pages', 'chapter:2:footnotes']]))
  })

  test('a composition failure reports one error and never makes the layout ready', () => {
    const { book, frames } = reflectedBookElement()
    const events: string[] = []
    book.dispatchEvent = ((event: Event) => {
      events.push(event.type === 'error' ? (event as CustomEvent<{ message: string }>).detail.message : event.type)
      return true
    }) as typeof book.dispatchEvent
    book.view = switchableBookView()
    const pages = frames[0]
    if (!pages) throw new Error('pages frame was not mounted')
    const failure = { source: pages.contentWindow, data: { type: 'segnavia:compose-failure', text: 'page limit reached' } } as MessageEvent
    ;(book as unknown as { onMessage: (event: MessageEvent) => void }).onMessage(failure)
    ;(book as unknown as { onMessage: (event: MessageEvent) => void }).onMessage(failure)
    expect(events).toEqual(['page limit reached'])
    expect((book as unknown as { readyLayouts: Set<string> }).readyLayouts.size).toBe(0)
  })

  test('a failed source refresh keeps the mounted frame live but ignores its composition failure', async () => {
    const { book, frames } = reflectedBookElement()
    const errors: string[] = []
    book.dispatchEvent = ((event: Event) => {
      if (event.type === 'error') errors.push((event as CustomEvent<{ message: string }>).detail.message)
      return true
    }) as typeof book.dispatchEvent
    book.view = switchableBookView()
    const stale = frames[0]
    if (!stale) throw new Error('pages frame was not mounted')
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch
    try {
      await book.attributeChangedCallback('src', null, 'https://example.test/newer.json')
    } finally {
      globalThis.fetch = realFetch
    }
    ;(book as unknown as { onMessage: (event: MessageEvent) => void }).onMessage({
      source: stale.contentWindow,
      data: { type: 'segnavia:book-place', key: 'chapter:2' },
    } as MessageEvent)
    ;(book as unknown as { onMessage: (event: MessageEvent) => void }).onMessage({
      source: stale.contentWindow,
      data: { type: 'segnavia:ready' },
    } as MessageEvent)
    ;(book as unknown as { onMessage: (event: MessageEvent) => void }).onMessage({
      source: stale.contentWindow,
      data: { type: 'segnavia:compose-failure', text: 'stale failure' },
    } as MessageEvent)
    expect((book as unknown as { places: Map<string, string> }).places.get('pages')).toBe('chapter:2')
    expect((book as unknown as { readyLayouts: Set<string> }).readyLayouts.has('pages')).toBe(true)
    expect(errors).toEqual(['The book at https://example.test/newer.json answered 503.'])
  })

  test('a failed handoff keeps the outgoing layout and reselecting reports the failure again', () => {
    const { book, attributes, frames } = reflectedBookElement()
    const errors: string[] = []
    book.dispatchEvent = ((event: Event) => {
      if (event.type === 'error') errors.push((event as CustomEvent<{ message: string }>).detail.message)
      return true
    }) as typeof book.dispatchEvent
    book.view = switchableBookView()
    book.layout = 'flow'
    const flow = frames.find((frame) => frame.dataset.segnaviaBookLayout === 'flow')
    if (!flow) throw new Error('flow frame was not mounted')
    ;(book as unknown as { onMessage: (event: MessageEvent) => void }).onMessage({
      source: flow.contentWindow,
      data: { type: 'segnavia:compose-failure', text: 'flow refused' },
    } as MessageEvent)
    expect(frames.filter((frame) => !frame.hidden).map((frame) => frame.dataset.segnaviaBookLayout)).toEqual(['pages'])
    expect(book.layout as string).toBe('pages')
    expect(attributes.get('layout')).toBe('pages')
    book.layout = 'flow'
    expect(errors).toEqual(['flow refused', 'flow refused'])
    expect(book.layout as string).toBe('pages')
  })
})
