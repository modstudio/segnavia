type Listener = () => void

export class FramePoolTestElement {
  className = ''
  dataset: Record<string, string> = {}
  style = { setProperty() {}, removeProperty() {} }
  title = ''
  inert = false
  isConnected = false
  contentWindow: Record<string, never> | null = null
  private children: FramePoolTestElement[] = []
  private listeners = new Map<string, Listener[]>()
  private parent: FramePoolTestElement | null = null

  constructor(readonly tagName: string) {
    if (tagName === 'iframe') this.contentWindow = {}
  }

  append(child: FramePoolTestElement) {
    child.parent = this
    child.connect(this.isConnected)
    this.children.push(child)
  }

  replaceChildren() {
    for (const child of this.children) child.connect(false)
    this.children = []
  }

  replaceWith(replacement: FramePoolTestElement) {
    if (!this.parent) return
    const index = this.parent.children.indexOf(this)
    this.connect(false)
    replacement.parent = this.parent
    replacement.connect(this.parent.isConnected)
    this.parent.children[index] = replacement
    this.parent = null
  }

  remove() {
    if (!this.parent) return
    this.parent.children = this.parent.children.filter((child) => child !== this)
    this.parent = null
    this.connect(false)
  }

  setAttribute(name: string, value: string) {
    if (name.startsWith('data-')) this.dataset[dataKey(name)] = value
  }

  removeAttribute(name: string) {
    if (name.startsWith('data-')) delete this.dataset[dataKey(name)]
  }

  toggleAttribute(name: string, force: boolean) {
    if (force) this.setAttribute(name, '')
    else this.removeAttribute(name)
  }

  addEventListener(name: string, listener: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener])
  }

  dispatch(name: string) {
    for (const listener of this.listeners.get(name) ?? []) listener()
  }

  querySelector(selector: string): FramePoolTestElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }

  querySelectorAll(selector: string): FramePoolTestElement[] {
    if (selector.includes(' ')) {
      const [parent, child] = selector.split(' ')
      return this.descendants()
        .filter((candidate) => candidate.matches(parent ?? ''))
        .flatMap((candidate) => candidate.querySelectorAll(child ?? ''))
    }
    return this.descendants().filter((candidate) => candidate.matches(selector))
  }

  closest(selector: string): FramePoolTestElement | null {
    const slideId = selector.match(/^\[data-slide-id="(.+)"\]$/)?.[1]
    let candidate: FramePoolTestElement | null = this
    while (candidate) {
      if (slideId && candidate.dataset.slideId === slideId) return candidate
      candidate = candidate.parent
    }
    return null
  }

  private descendants(): FramePoolTestElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()])
  }

  private matches(selector: string): boolean {
    if (selector === 'iframe') return this.tagName === 'iframe'
    if (!selector.startsWith('.segnavia-stage__canvas')) return false
    if (this.className !== 'segnavia-stage__canvas') return false
    return !selector.includes('[data-active]') || 'active' in this.dataset
  }

  private connect(value: boolean) {
    this.isConnected = value
    for (const child of this.children) child.connect(value)
  }
}

function dataKey(attribute: string) {
  return attribute.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

export function installFramePoolTestDocument() {
  Object.assign(globalThis, { document: { createElement: (name: string) => new FramePoolTestElement(name) }, window: {} })
}
