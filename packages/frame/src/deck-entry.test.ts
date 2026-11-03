import { expect, test } from 'bun:test'
import { Page, Print } from '@segnavia/format'

const definitions = new Map<string, CustomElementConstructor>()

class TestElement extends EventTarget {
  children: unknown[] = []
  dataset: Record<string, string> = {}
  isConnected = false
  part = { add() {} }
  style = {
    inlineSize: '',
    marginInline: '',
    maxInlineSize: '',
    removeProperty() {},
    setProperty() {},
  }

  append(...nodes: unknown[]) {
    this.children.push(...nodes)
  }

  get firstElementChild(): unknown | null {
    return this.children[0] ?? null
  }

  getAttribute() {
    return null
  }

  hasAttribute() {
    return false
  }

  querySelector() {
    return null
  }

  replaceChildren(...nodes: unknown[]) {
    this.children = nodes
  }

  setAttribute() {}
}

function installGlobals() {
  definitions.clear()
  Object.assign(globalThis, {
    HTMLElement: TestElement,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    customElements: {
      define(name: string, element: CustomElementConstructor) {
        definitions.set(name, element)
      },
      get(name: string) {
        return definitions.get(name)
      },
    },
    document: {
      createElement(tag: string) {
        return Object.assign(new TestElement(), {
          className: '',
          dir: '',
          load() {},
          srcdoc: '',
          tagName: tag,
          title: '',
        })
      },
    },
  })
}

test('the deck entry defines only deck elements and a page thumbnail defines its page on demand', async () => {
  installGlobals()
  const deck = await import('./deck.ts')

  expect(definitions.get('segnavia-stage')).toBe(deck.SegnaviaStage)
  expect(definitions.get('segnavia-thumbnail')).toBe(deck.SegnaviaThumbnail)
  expect(definitions.has('segnavia-board')).toBeFalse()
  expect(definitions.has('segnavia-book')).toBeFalse()
  expect(definitions.has('segnavia-page')).toBeFalse()

  const viewport = new TestElement()
  const thumbnail = {
    pageValue: Page.parse({ html: '<p>Page</p>' }),
    printValue: Print.parse({ paper: 'a4' }),
    viewport,
    motifOptions: undefined,
    placementOptions: undefined,
    widthOptions: undefined,
    fontOptions: undefined,
    slotOptions: undefined,
    stylesheet: '',
  }
  const mountPage = deck.SegnaviaThumbnail.prototype as unknown as { mountPage(this: typeof thumbnail): void }
  expect(() => mountPage.mountPage.call(thumbnail)).not.toThrow()
  expect(definitions.has('segnavia-page')).toBeTrue()
  expect(viewport.children).toHaveLength(1)

  const main = await import('./index.ts')
  expect(main.formatTime).toBe(deck.formatTime)
})
