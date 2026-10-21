import { railMoveTarget, railSelection } from './rail-navigation.ts'

export const RAIL_REORDER_CSS = `
button[data-insert="before"]::before,button[data-insert="after"]::after{content:"";position:absolute;z-index:3;inset-inline:0;block-size:3px;background:var(--segnavia-accent,#356ae6);border-radius:2px}
button[data-insert="before"]::before{inset-block-start:-6px}button[data-insert="after"]::after{inset-block-end:-6px}
`

export interface RailReorderIntent {
  fromIndex: number
  toIndex: number
}

interface RailReorderOptions {
  root: ShadowRoot
  count: () => number
  horizontal: () => boolean
  direction: () => 'ltr' | 'rtl'
  buttons: () => HTMLButtonElement[]
  excludes: (target: Element) => boolean
}

export class RailReorder {
  private from: number | null = null
  private enabled = false
  private listeners = new Set<(intent: RailReorderIntent) => void>()

  constructor(private options: RailReorderOptions) {}

  attach() {
    this.options.root.addEventListener('keydown', this.keydown as EventListener)
    this.options.root.addEventListener('dragstart', this.start as EventListener)
    this.options.root.addEventListener('dragover', this.over as EventListener)
    this.options.root.addEventListener('drop', this.drop as EventListener)
    this.options.root.addEventListener('dragend', this.clear)
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    this.sync()
    if (!enabled) this.clear()
  }

  sync() {
    for (const button of this.options.buttons()) button.draggable = this.enabled
  }

  subscribe(listener: (intent: RailReorderIntent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  clear = () => {
    this.from = null
    for (const button of this.options.buttons()) button.removeAttribute('data-insert')
  }

  private start = (event: DragEvent) => {
    const target = event.target as Element
    if (!this.enabled || this.options.excludes(target)) return event.preventDefault()
    const button = target.closest<HTMLButtonElement>('button[data-index]')
    if (!button) return
    this.from = Number(button.dataset.index)
    event.dataTransfer?.setData('text/plain', button.dataset.index ?? '')
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  private over = (event: DragEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]')
    if (this.from === null || !button) return
    event.preventDefault()
    const rect = button.getBoundingClientRect()
    const after = this.options.horizontal()
      ? this.options.direction() === 'rtl'
        ? event.clientX < rect.left + rect.width / 2
        : event.clientX >= rect.left + rect.width / 2
      : event.clientY >= rect.top + rect.height / 2
    for (const item of this.options.buttons()) item.removeAttribute('data-insert')
    button.dataset.insert = after ? 'after' : 'before'
  }

  private drop = (event: DragEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]')
    if (this.from === null || !button) return
    event.preventDefault()
    const from = this.from
    const to = railMoveTarget(from, Number(button.dataset.index), button.dataset.insert === 'after', this.options.count())
    this.clear()
    this.emit(from, to)
  }

  private keydown = (event: KeyboardEvent) => {
    if (!this.enabled || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const target = event.target as Element
    if (this.options.excludes(target)) return
    const button = target.closest<HTMLButtonElement>('button[data-index]')
    if (!button) return
    const from = Number(button.dataset.index)
    const to = railSelection(from, event.key, this.options.count(), this.options.horizontal(), this.options.direction())
    if (to === from) return
    event.preventDefault()
    this.emit(from, to)
  }

  private emit(fromIndex: number, toIndex: number) {
    for (const listener of this.listeners) listener({ fromIndex, toIndex })
  }
}
