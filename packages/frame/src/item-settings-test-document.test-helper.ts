import { afterAll } from 'bun:test'

export class ItemSettingsTestElement extends EventTarget {
  children: ItemSettingsTestElement[] = []
  parentNode: ItemSettingsTestElement | null = null
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
  }

  setAttribute() {}
  removeAttribute() {}
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
    value: { createElement: () => new ItemSettingsTestElement(), documentElement: { style: {} }, activeElement: null },
  })
}
