import { describe, expect, test } from 'bun:test'
import { reflectedBookElement, switchableBookView } from './book-test-view.ts'

describe('book layout lifecycle', () => {
  test('a reloaded frame receives the shown layout when its srcdoc is stale', () => {
    const { book } = reflectedBookElement()
    const messages: unknown[] = []
    const frame = {
      contentWindow: {
        postMessage(value: unknown) {
          messages.push(value)
        },
      },
    }
    ;(book as unknown as { querySelector: () => typeof frame }).querySelector = () => frame
    ;(book as unknown as { currentView: unknown }).currentView = switchableBookView()
    ;(book as unknown as { currentLayout: string }).currentLayout = 'flow'
    ;(book as unknown as { mountedLayout: string }).mountedLayout = 'pages'
    ;(book as unknown as { frameReady: boolean }).frameReady = true
    ;(book as unknown as { dispatchEvent: () => boolean }).dispatchEvent = () => true

    const previousWindow = globalThis.window
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { removeEventListener() {} },
    })
    book.disconnectedCallback()
    globalThis.window = previousWindow
    expect((book as unknown as { frameReady: boolean }).frameReady).toBe(false)
    ;(book as unknown as { onMessage: (event: MessageEvent) => void }).onMessage({
      source: frame.contentWindow,
      data: { type: 'segnavia:ready' },
    } as unknown as MessageEvent)

    expect(messages).toEqual([{ type: 'segnavia:book-layout', layout: 'flow' }])
  })

  test('a missing flow view refuses flow but preserves the request for a later capable view', () => {
    const { book, attributes } = reflectedBookElement()
    const mounted: Array<{ srcdoc: string }> = []
    const errors: string[] = []
    ;(book as unknown as { mountFrame: (rendered: { srcdoc: string }) => void }).mountFrame = (rendered) => mounted.push(rendered)
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
    expect(mounted.at(-1)?.srcdoc).toContain('"screen":{"spread":false,"layout":"flow"}')
  })
})
