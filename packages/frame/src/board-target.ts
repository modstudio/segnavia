import type { SegnaviaBoard } from './board.ts'

export class BoardTargetBinding {
  private propertyTarget: SegnaviaBoard | null | undefined
  private active: SegnaviaBoard | null = null

  constructor(
    private readonly companion: HTMLElement,
    private readonly events: Readonly<Record<string, EventListener>>,
    private readonly changed: () => void,
  ) {}

  get target(): SegnaviaBoard | null {
    return this.propertyTarget === undefined ? this.attributeTarget() : this.propertyTarget
  }

  get current(): SegnaviaBoard | null {
    return this.active
  }

  set target(value: SegnaviaBoard | null) {
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

  private attributeTarget(): SegnaviaBoard | null {
    const id = this.companion.getAttribute('for')
    const candidate = id ? (this.companion.getRootNode() as Document | ShadowRoot).querySelector(`#${CSS.escape(id)}`) : null
    return candidate?.localName === 'segnavia-board' ? (candidate as SegnaviaBoard) : null
  }

  private bind() {
    if (!this.companion.isConnected) return
    const target = this.target
    if (target === this.active) return
    this.listen(target)
    this.changed()
  }

  private listen(target: SegnaviaBoard | null) {
    for (const [event, listener] of Object.entries(this.events)) this.active?.removeEventListener(event, listener)
    this.active = target
    for (const [event, listener] of Object.entries(this.events)) target?.addEventListener(event, listener)
  }
}
