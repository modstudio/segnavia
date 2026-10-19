import { type BoardView, resolveDirection } from '@segnavia/format'
import { placeBoardNode } from './board-placement.ts'

interface TitledBox {
  x: number
  y: number
  width: number
}

// An item's name sits above it, outside the item, which clips its own content. It is hidden from assistive technology because the item already carries the name as its label.
export class BoardItemTitles {
  private readonly titles = new Map<string, HTMLElement>()

  constructor(private readonly surface: HTMLElement) {}

  mount(id: string, item: HTMLElement) {
    const title = document.createElement('div')
    title.part.add('item-title')
    title.setAttribute('aria-hidden', 'true')
    const container = document.createElement('div')
    container.append(document.createElement('span'))
    title.append(container)
    this.titles.set(id, title)
    this.surface.insertBefore(title, item)
  }

  place(id: string, view: BoardView, box: TitledBox) {
    const title = this.titles.get(id)
    if (title) placeBoardNode(title, view, box)
  }

  name(id: string, text: string, direction: 'ltr' | 'rtl') {
    const container = this.titles.get(id)?.firstElementChild as HTMLElement | null | undefined
    const name = container?.firstElementChild as HTMLElement | null | undefined
    if (container) container.dir = direction
    if (!name || name.textContent === text) return
    name.textContent = text
    name.dir = resolveDirection(undefined, undefined, text)
  }

  remove(id: string) {
    this.titles.get(id)?.remove()
    this.titles.delete(id)
  }
}
