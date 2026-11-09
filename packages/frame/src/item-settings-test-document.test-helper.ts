import { afterAll } from 'bun:test'

export class ItemSettingsTestElement extends EventTarget {
  readonly tagName: string
  children: ItemSettingsTestElement[] = []
  parentNode: ItemSettingsTestElement | null = null
  activeElement: ItemSettingsTestElement | null = null
  dataset: Record<string, string> = {}
  part = new Set<string>()
  textContent = ''
  value = ''
  disabled = false
  readOnly = false
  required = false
  type = ''
  dir = ''
  checked = false
  accept = ''
  selectionStart: number | null = null
  selectionEnd: number | null = null
  private attributes = new Map<string, string>()

  constructor(tagName = 'div') {
    super()
    this.tagName = tagName.toUpperCase()
  }

  get firstChild(): ItemSettingsTestElement | null {
    return this.children[0] ?? null
  }
  get isConnected() {
    return this.parentNode !== null
  }

  attachShadow() {
    return new ItemSettingsTestElement()
  }

  append(...nodes: ItemSettingsTestElement[]) {
    for (const node of nodes) {
      node.remove()
      node.parentNode = this
      this.children.push(node)
    }
  }

  replaceChildren(...nodes: ItemSettingsTestElement[]) {
    for (const child of this.children) child.parentNode = null
    this.children = []
    this.append(...nodes)
  }

  insertBefore(node: ItemSettingsTestElement, before: ItemSettingsTestElement | null) {
    node.remove()
    node.parentNode = this
    const index = before ? this.children.indexOf(before) : -1
    if (index < 0) this.children.push(node)
    else this.children.splice(index, 0, node)
  }

  remove() {
    if (!this.parentNode) return
    const index = this.parentNode.children.indexOf(this)
    if (index >= 0) this.parentNode.children.splice(index, 1)
    this.parentNode = null
  }

  replaceWith(node: ItemSettingsTestElement) {
    const parent = this.parentNode
    if (!parent) return
    const index = parent.children.indexOf(this)
    this.parentNode = null
    node.remove()
    node.parentNode = parent
    parent.children[index] = node
  }

  focus() {
    ;(document as unknown as { activeElement: ItemSettingsTestElement }).activeElement = this
    for (let ancestor = this.parentNode; ancestor; ancestor = ancestor.parentNode) ancestor.activeElement = this
  }

  contains(node: ItemSettingsTestElement): boolean {
    return node === this || this.children.some((child) => child.contains(node))
  }

  querySelectorAll(selector: string): ItemSettingsTestElement[] {
    const tag = selector.toUpperCase()
    return this.children.flatMap((child) => [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(selector)])
  }

  setSelectionRange(start: number, end: number) {
    this.selectionStart = start
    this.selectionEnd = end
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }
}

export function installItemSettingsTestDocument(): void {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')

  afterAll(() => {
    for (const [name, previous] of [
      ['HTMLElement', previousHTMLElement],
      ['document', previousDocument],
    ] as const) {
      if (previous) Object.defineProperty(globalThis, name, previous)
      else Reflect.deleteProperty(globalThis, name)
    }
  })

  Object.assign(globalThis, { HTMLElement: ItemSettingsTestElement })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: { createElement: (tag: string) => new ItemSettingsTestElement(tag), documentElement: { style: {} }, activeElement: null },
  })
}
