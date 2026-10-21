import { Deck, type SlotsOptions } from '@segnavia/format'

class TestElement extends EventTarget {}
export class TestNode extends TestElement {
  children: TestNode[] = []
  className = ''
  srcdoc = ''
  dataset: Record<string, string> = {}
  part = { add() {} }
  style = { setProperty() {}, removeProperty() {} }
  private attributes = new Map<string, string>()

  get firstElementChild(): TestNode | null {
    return this.children[0] ?? null
  }

  append(...nodes: TestNode[]) {
    this.children.push(...nodes)
  }

  replaceChildren(...nodes: TestNode[]) {
    this.children = nodes
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }

  querySelector(selector: string): TestNode | null {
    for (const child of this.children) {
      if (selector === 'iframe' && child.tagName === 'iframe') return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }

  constructor(readonly tagName = 'div') {
    super()
  }
}

Object.assign(globalThis, {
  HTMLElement: TestElement,
  CustomEvent: class<T> extends Event {
    detail: T
    constructor(type: string, options: CustomEventInit<T> = {}) {
      super(type, options)
      this.detail = options.detail as T
    }
  },
  document: { createElement: (tag: string) => new TestNode(tag) },
})

const { SegnaviaThumbnail } = await import('./thumbnail.ts')
const textSlot = [{ key: 'name', label: 'Name', type: 'text' as const, required: false }]

export function thumbnailHarness(deck: ReturnType<typeof Deck.parse>, slots: SlotsOptions) {
  const viewport = new TestNode()
  const errors: unknown[] = []
  const thumbnail = {
    value: deck,
    pageValue: null,
    slideIndex: 0,
    controller: null,
    baseUrl: undefined,
    slideResolver: undefined,
    stylesheet: '',
    slotOptions: slots,
    slotPreparation: undefined,
    viewport,
    resolution: 0,
    isConnected: true,
    near: true,
    clientWidth: deck.size.width,
    measure: (SegnaviaThumbnail.prototype as unknown as { measure(): void }).measure,
    clear: (SegnaviaThumbnail.prototype as unknown as { clear(): void }).clear,
    dispatchEvent(event: CustomEvent) {
      errors.push(event.detail)
      return true
    },
    mount: (SegnaviaThumbnail.prototype as unknown as { mount(): Promise<void> }).mount,
  }
  return { thumbnail, viewport, errors }
}

export function slotDeck(html: string) {
  return Deck.parse({ title: 'Slots', slots: textSlot, slides: [{ id: 'one', content: { kind: 'html', html } }] })
}
