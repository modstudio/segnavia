import { describe, expect, test } from 'bun:test'
import { reflectedBookElement, switchableBookView } from './book-test-view.ts'

describe('book layout lifecycle', () => {
  test('a reloaded frame keeps its intrinsic layout and readiness does not outlive a detach', () => {
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
    expect((book as unknown as { readyLayouts: Set<string> }).readyLayouts.has('flow')).toBe(true)
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
})
