import { afterAll } from 'bun:test'

export class ItemSettingsTestElement extends EventTarget {
  children: ItemSettingsTestElement[] = []
  dataset: Record<string, string> = {}
  part = new Set<string>()
  textContent = ''
  value = ''
  disabled = false
  readOnly = false
  required = false
  type = ''
  dir = ''

  attachShadow() {
    return new ItemSettingsTestElement()
  }

  append(...nodes: ItemSettingsTestElement[]) {
    this.children.push(...nodes)
  }

  setAttribute() {}
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
    value: { createElement: () => new ItemSettingsTestElement(), documentElement: { style: {} } },
  })
}
