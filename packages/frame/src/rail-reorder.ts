import { railMoveTarget } from './rail-navigation.ts'

export const RAIL_REORDER_CSS = `
button[data-insert="before"]::before,button[data-insert="after"]::after{content:"";position:absolute;z-index:3;inset-inline:0;block-size:3px;background:var(--segnavia-accent,#356ae6);border-radius:2px}
button[data-insert="before"]::before{inset-block-start:-6px}button[data-insert="after"]::after{inset-block-end:-6px}
`

interface RailDragOptions {
  root: ShadowRoot
  enabled: () => boolean
  count: () => number
  horizontal: () => boolean
  direction: () => 'ltr' | 'rtl'
  buttons: () => HTMLButtonElement[]
  reorder: (fromIndex: number, toIndex: number) => void
}

export class RailDragReorder {
  private from: number | null = null

  constructor(private options: RailDragOptions) {}

  attach() {
    this.options.root.addEventListener('dragstart', this.start as EventListener)
    this.options.root.addEventListener('dragover', this.over as EventListener)
    this.options.root.addEventListener('drop', this.drop as EventListener)
    this.options.root.addEventListener('dragend', this.clear)
  }

  clear = () => {
    this.from = null
    for (const button of this.options.buttons()) button.removeAttribute('data-insert')
  }

  private start = (event: DragEvent) => {
    if (!this.options.enabled()) return event.preventDefault()
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]')
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
    this.options.reorder(from, to)
  }
}
