import { afterAll, expect, test } from 'bun:test'
import { Cover, Page, Print } from '@segnavia/format'
import { internalPageLoad } from './document-value-load.ts'
import { HEADLESS_ELEMENTS } from './headless-elements.ts'
import { pageDocument } from './page-document.test-helper.ts'

const definitions = new Map<string, CustomElementConstructor>()
const previousGlobals = new Map(
  ['HTMLElement', 'customElements', 'document', 'ResizeObserver'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const),
)

afterAll(() => {
  for (const [name, previous] of previousGlobals) {
    if (previous) Object.defineProperty(globalThis, name, previous)
    else Reflect.deleteProperty(globalThis, name)
  }
})

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

  toggleAttribute() {}
}

function installGlobals() {
  definitions.clear()
  const globals = {
    HTMLElement: TestElement,
    ResizeObserver: class ResizeObserver {
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
          [internalPageLoad]() {},
          srcdoc: '',
          tagName: tag,
          title: '',
        })
      },
    },
  }
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
}

test('the deck entry defines only deck elements and thumbnails define pages on demand', async () => {
  installGlobals()
  const deck = await import('./deck.ts')

  expect(definitions.get(HEADLESS_ELEMENTS.stage)).toBe(deck.SegnaviaStage)
  expect(definitions.get(HEADLESS_ELEMENTS.thumbnail)).toBe(deck.SegnaviaThumbnail)
  expect(new Set(definitions.keys())).toEqual(new Set([HEADLESS_ELEMENTS.stage, HEADLESS_ELEMENTS.thumbnail]))

  definitions.clear()
  const viewport = new TestElement()
  const thumbnail = {
    pageValue: Page.parse({ html: '<p>Page</p>' }),
    printValue: Print.parse({ paper: 'a4' }),
    viewport,
    motifOptions: undefined,
    fontOptions: undefined,
    placementOptions: undefined,
    widthOptions: undefined,
    slotOptions: undefined,
    stylesheet: '',
  }
  const mountPage = deck.SegnaviaThumbnail.prototype as unknown as { mountPage(this: typeof thumbnail): void }
  expect(() => mountPage.mountPage.call(thumbnail)).not.toThrow()
  expect(definitions.has(HEADLESS_ELEMENTS.page)).toBeTrue()
  expect(viewport.children).toHaveLength(1)

  definitions.clear()
  const coverViewport = new TestElement()
  const coverThumbnail = {
    designedCoverValue: {
      cover: Cover.parse({ page: pageDocument('<p>Cover</p>') }),
    },
    designedCoverDisposal: undefined,
    viewport: coverViewport,
    motifOptions: undefined,
    fontOptions: undefined,
    placementOptions: undefined,
    origins: [],
    slotOptions: undefined,
    dispatchEvent() {},
  }
  const mount = deck.SegnaviaThumbnail.prototype as unknown as { mount(this: typeof coverThumbnail): Promise<void> }
  await mount.mount.call(coverThumbnail)
  expect(definitions.has(HEADLESS_ELEMENTS.page)).toBeTrue()
  expect(coverViewport.children).toHaveLength(1)

  const main = await import('./index.ts')
  expect(main.formatTime).toBe(deck.formatTime)
})
