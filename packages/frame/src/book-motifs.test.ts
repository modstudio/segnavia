import { describe, expect, test } from 'bun:test'
import { reflectedBookElement, switchableBookView } from './book-test-view.ts'

const motifs = {
  source: {
    motif: async (key: string) => ({
      key,
      revision: 'one',
      label: key,
      fields: [],
      versions: [{ lang: 'en', html: '<strong data-expanded-motif>Expanded</strong>' }],
      fonts: [],
    }),
  },
}

describe('book motifs', () => {
  test('a later flow frame uses the motif-expanded prepared view', async () => {
    const { book, frames } = reflectedBookElement()
    Object.defineProperty(book, 'isConnected', { configurable: true, get: () => true })
    book.motifs = motifs
    const view = { ...switchableBookView(), lang: 'en' }
    view.html = '<main data-segnavia-galleys><span data-motif="held"></span></main>'
    view.flow = '<main data-segnavia-flow="chapter"><span data-motif="held"></span></main>'
    book.view = view
    for (let i = 0; i < 20; i += 1) await Promise.resolve()

    expect(frames.find((frame) => frame.dataset.segnaviaBookLayout === 'pages')?.srcdoc).toContain('data-expanded-motif')
    book.layout = 'flow'
    expect(frames.find((frame) => frame.dataset.segnaviaBookLayout === 'flow')?.srcdoc).toContain('data-expanded-motif')
    expect(book.view?.flow).toContain('data-motif="held"')
  })

  test('motifs and a view assigned while detached mount after connection', async () => {
    const previousWindow = globalThis.window
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { addEventListener() {}, removeEventListener() {} },
    })
    const { book, frames } = reflectedBookElement()
    ;(book as unknown as { hasAttribute: (name: string) => boolean }).hasAttribute = (name) => name === 'unstyled'
    let connected = false
    Object.defineProperty(book, 'isConnected', { configurable: true, get: () => connected })
    book.motifs = motifs
    book.view = { html: '<main><span data-motif="held"></span></main>', lang: 'en' }
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
    expect(frames).toHaveLength(0)

    connected = true
    book.connectedCallback()
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
    globalThis.window = previousWindow
    expect(frames.at(-1)?.srcdoc).toContain('data-expanded-motif')
  })
})
