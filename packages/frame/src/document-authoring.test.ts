import { describe, expect, test } from 'bun:test'
import { Page, type SlotsOptions } from '@segnavia/format'

class TestElement extends EventTarget {
  className = ''
  tagName = ''
  type = ''
  textContent = ''
  isConnected = false
  draggable = false
  tabIndex = 0
  children: TestElement[] = []
  dataset: Record<string, string> = {}
  style = { removeProperty() {}, setProperty() {} }
  part = { add() {} }
  slotValue: SlotsOptions | undefined
  slotWrites = 0

  get slots(): SlotsOptions | undefined {
    return this.slotValue
  }

  set slots(value: SlotsOptions | undefined) {
    this.slotWrites++
    this.slotValue = value
  }

  attachShadow() {
    return new TestElement()
  }

  set innerHTML(value: string) {
    this.children = []
    if (!value.includes('<ol')) return
    const list = new TestElement()
    list.tagName = 'ol'
    this.children.push(list)
  }

  append(...nodes: TestElement[]) {
    this.children.push(...nodes)
  }

  replaceChildren(...nodes: TestElement[]) {
    this.children = nodes
  }

  querySelector(selector: string): TestElement | null {
    for (const child of this.children) {
      if (matches(child, selector)) return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }

  querySelectorAll(selector: string): TestElement[] {
    const found: TestElement[] = []
    for (const child of this.children) {
      if (matches(child, selector)) found.push(child)
      found.push(...child.querySelectorAll(selector))
    }
    return found
  }

  setAttribute() {}
  getAttribute() {
    return null
  }
  removeAttribute() {}
  scrollIntoView() {}
}

function matches(node: TestElement, selector: string) {
  if (selector === 'button[data-index]') return node.tagName === 'button' && node.dataset.index !== undefined
  return node.tagName === selector
}

Object.assign(globalThis, {
  HTMLElement: TestElement,
  customElements: {
    define() {},
    get: () => undefined,
  },
  document: {
    createElement(tag: string) {
      const element = new TestElement()
      element.tagName = tag
      return element
    },
  },
  getComputedStyle: () => ({ direction: 'ltr' }),
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  window: { addEventListener() {}, removeEventListener() {} },
})

const { DocumentAuthoringController } = await import('./document-authoring.ts')
const { SegnaviaDocument } = await import('./document.ts')
type DocumentAuthoringControllerInstance = InstanceType<typeof DocumentAuthoringController>

test('attachment reads the visible page before opening item settings', () => {
  const opened: Array<{ pageId: string }> = []
  const documentElement = Object.assign(new EventTarget(), {
    currentPageIndex: 2,
    pages: [] as Page[],
    print: null,
    css: '',
    setAuthoringRail() {},
    scrollToPage() {},
  })
  documentElement.addEventListener('segnavia-item-settings-open', (event) => opened.push((event as CustomEvent<{ pageId: string }>).detail))
  const controller = new DocumentAuthoringController(documentElement as never, { movePage: async () => {} }, {})
  documentElement.pages = ['first', 'second', 'third'].map((id) => Page.parse({ id, html: id }))

  ;(controller as unknown as { openItemSettings(): void }).openItemSettings()

  expect(opened).toEqual([{ pageId: 'third' }])
})

function heldController(outcome: 'resolve' | 'reject') {
  let settle = () => {}
  const pages = ['a', 'b'].map((id) => Page.parse({ id, html: id }))
  const railCalls: unknown[] = []
  const document = Object.assign(new EventTarget(), {
    pages,
    print: null,
    css: '',
    setAuthoringRail: (rail: unknown) => railCalls.push(rail),
    scrollToPage() {},
  })
  const rail = {
    setReorderEnabled() {},
    configure() {},
  }
  const pending = new Promise<void>((resolve, reject) => {
    settle = outcome === 'resolve' ? resolve : () => reject(new Error('No'))
  })
  const controller = Reflect.construct(EventTarget, [], DocumentAuthoringController) as DocumentAuthoringControllerInstance
  Object.assign(controller, {
    document,
    handlers: { movePage: () => pending },
    rail,
    unsubscribe: () => {},
    pending: false,
    stopped: false,
    identityError: null,
  })
  return { controller, document, railCalls, settle }
}

describe('document authoring detach during reorder', () => {
  for (const outcome of ['resolve' as const, 'reject' as const]) {
    test(`does not reinstall the rail or emit completion events after ${outcome}`, async () => {
      const { controller, document, railCalls, settle } = heldController(outcome)
      const dirty: boolean[] = []
      const errors: unknown[] = []
      controller.addEventListener('dirty-change', (event: Event) => dirty.push((event as CustomEvent<{ dirty: boolean }>).detail.dirty))
      controller.addEventListener('authoring-error', (event: Event) => errors.push((event as CustomEvent).detail))

      const moving = (controller as unknown as { move(fromIndex: number, toIndex: number): Promise<void> }).move(0, 1)
      controller.detach()
      settle()
      await moving

      expect(railCalls.at(-1)).toBeNull()
      expect(dirty).toEqual([true])
      expect(errors).toEqual([])
      expect(document.pages.map((page) => page.id)).toEqual(outcome === 'resolve' ? ['b', 'a'] : ['a', 'b'])
    })
  }
})

function slottedPages() {
  return ['a', 'b'].map((id) =>
    Page.parse({
      id,
      html: `<p data-slot="name">${id}</p>`,
      slots: [{ key: 'name', label: 'Name', type: 'text', required: false }],
    }),
  )
}

function slottedDocument(slots: SlotsOptions) {
  const documentElement = new SegnaviaDocument()
  documentElement.pages = slottedPages()
  documentElement.slots = slots
  const controller = new DocumentAuthoringController(documentElement, { movePage: async () => {} }, {})
  return { documentElement, controller, rail: authoringRail(controller) }
}

function authoringRail(controller: DocumentAuthoringControllerInstance) {
  return (controller as unknown as { rail: TestElement & { root: TestElement } }).rail
}

describe('document authoring rail slots', () => {
  const ada: SlotsOptions = { fill: { id: 'ada', values: { name: 'Ada' } } }

  test('every rail thumbnail receives the document slots object', () => {
    const { documentElement, rail } = slottedDocument(ada)
    const thumbnails = rail.root.querySelectorAll('segnavia-thumbnail')
    expect(thumbnails).toHaveLength(2)
    expect(thumbnails.map((thumbnail) => thumbnail.slots)).toEqual([documentElement.slots, documentElement.slots])
    expect(thumbnails[0]?.slots).toBe(ada)
    expect(thumbnails[1]?.slots).toBe(ada)
  })

  test('a new slots value reaches existing thumbnails without replacing the rail items', () => {
    const { documentElement, rail } = slottedDocument(ada)
    const items = rail.root.querySelectorAll('li')
    const thumbnails = rail.root.querySelectorAll('segnavia-thumbnail')
    const writes = thumbnails.map((thumbnail) => thumbnail.slotWrites)
    const bea: SlotsOptions = { fill: { id: 'bea', values: { name: 'Bea' } } }

    documentElement.slots = bea

    const nextItems = rail.root.querySelectorAll('li')
    const nextThumbnails = rail.root.querySelectorAll('segnavia-thumbnail')
    expect(nextItems).toHaveLength(2)
    expect(nextItems[0]).toBe(items[0])
    expect(nextItems[1]).toBe(items[1])
    expect(nextThumbnails[0]).toBe(thumbnails[0])
    expect(nextThumbnails[1]).toBe(thumbnails[1])
    expect(nextThumbnails[0]?.slots).toBe(bea)
    expect(nextThumbnails[1]?.slots).toBe(bea)

    documentElement.slots = bea
    expect(nextThumbnails.map((thumbnail) => thumbnail.slotWrites)).toEqual(thumbnails.map((thumbnail, index) => (writes[index] ?? 0) + 1))
  })

  test('reconfigured thumbnails after a reorder still carry the slots', async () => {
    const { documentElement, controller, rail } = slottedDocument(ada)
    await (controller as unknown as { move(fromIndex: number, toIndex: number): Promise<void> }).move(0, 1)
    expect(documentElement.pages.map((page) => page.id)).toEqual(['b', 'a'])
    const thumbnails = rail.root.querySelectorAll('segnavia-thumbnail')
    expect(thumbnails).toHaveLength(2)
    expect(thumbnails[0]?.slots).toBe(ada)
    expect(thumbnails[1]?.slots).toBe(ada)
  })
})
