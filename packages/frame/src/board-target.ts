import type { SegnaviaBoard } from './board.ts'

export class TargetBinding<T extends HTMLElement> {
  private propertyTarget: T | null | undefined
  private active: T | null = null

  constructor(
    private readonly companion: HTMLElement,
    private readonly events: Readonly<Record<string, EventListener>>,
    private readonly changed: () => void,
    private readonly attribute = 'for',
    private readonly localName = 'segnavia-board',
  ) {}

  get target(): T | null {
    return this.propertyTarget === undefined ? this.attributeTarget() : this.propertyTarget
  }

  get current(): T | null {
    return this.active
  }

  set target(value: T | null) {
    this.propertyTarget = value
    this.bind()
  }

  connect() {
    this.bind()
  }

  attributeChanged() {
    if (this.propertyTarget === undefined) this.bind()
  }

  disconnect() {
    this.listen(null)
  }

  private attributeTarget(): T | null {
    const id = this.companion.getAttribute(this.attribute)
    const candidate = id ? (this.companion.getRootNode() as Document | ShadowRoot).querySelector(`#${CSS.escape(id)}`) : null
    return candidate?.localName === this.localName ? (candidate as T) : null
  }

  private bind() {
    if (!this.companion.isConnected) return
    const target = this.target
    if (target === this.active) return
    this.listen(target)
    this.changed()
  }

  private listen(target: T | null) {
    for (const [event, listener] of Object.entries(this.events)) this.active?.removeEventListener(event, listener)
    this.active = target
    for (const [event, listener] of Object.entries(this.events)) target?.addEventListener(event, listener)
  }
}

export class BoardTargetBinding extends TargetBinding<SegnaviaBoard> {
  constructor(companion: HTMLElement, events: Readonly<Record<string, EventListener>>, changed: () => void) {
    super(companion, events, changed, 'for', 'segnavia-board')
  }
}
