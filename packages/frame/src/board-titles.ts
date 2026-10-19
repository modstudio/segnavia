import { type BoardItem, type BoardView, resolveDirection } from '@segnavia/format'
import { actionsForKind, type BoardItemAction, type BoardItemKind } from './board-actions.ts'
import { placeBoardNode } from './board-placement.ts'
import type { BoardLabels } from './labels.ts'

interface TitledBox {
  x: number
  y: number
  width: number
}

// An item's title sits above it, outside the item that clips its own content. Its name is hidden from assistive technology because the item already carries the name as its label, while its actions remain reachable.
export class BoardItemTitles {
  private readonly titles = new Map<string, HTMLElement>()
  private readonly rendered = new Map<
    string,
    { item: BoardItem; text: string; direction: 'ltr' | 'rtl'; kindIcon: unknown; actions: readonly BoardItemAction[]; labels: BoardLabels }
  >()

  mount(id: string, item: HTMLElement) {
    const title = document.createElement('div')
    title.part.add('item-title')
    title.dataset.boardTitle = id
    const container = document.createElement('div')
    title.append(container)
    this.titles.set(id, title)
    item.after(title)
  }

  place(id: string, view: BoardView, box: TitledBox) {
    const title = this.titles.get(id)
    if (title) placeBoardNode(title, view, box)
  }

  content(
    item: BoardItem,
    text: string,
    direction: 'ltr' | 'rtl',
    kindIcon: ((kind: BoardItemKind) => Node | null | undefined) | undefined,
    actions: readonly BoardItemAction[],
    labels: BoardLabels,
  ) {
    const id = item.id
    const container = this.titles.get(id)?.firstElementChild as HTMLElement | null | undefined
    if (!container) return
    const previous = this.rendered.get(id)
    if (
      previous?.item === item &&
      previous.text === text &&
      previous.direction === direction &&
      previous.kindIcon === kindIcon &&
      previous.actions === actions &&
      previous.labels === labels
    )
      return
    this.rendered.set(id, { item, text, direction, kindIcon, actions, labels })
    container.replaceChildren()
    container.dir = direction
    const icon = document.createElement('span')
    icon.part.add('item-icon')
    icon.setAttribute('aria-hidden', 'true')
    const iconNode = kindIcon?.(item.kind)
    if (iconNode) icon.append(iconNode)
    const name = document.createElement('span')
    name.part.add('item-name')
    name.setAttribute('aria-hidden', 'true')
    name.textContent = text
    name.dir = resolveDirection(undefined, undefined, text)
    const actionArea = document.createElement('span')
    actionArea.part.add('item-actions')
    for (const action of actionsForKind(actions, item.kind)) actionArea.append(this.action(action, item, text, labels))
    container.append(icon, name, actionArea)
  }

  private action(action: BoardItemAction, item: BoardItem, name: string, labels: BoardLabels): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.part.add('item-action')
    button.dataset.action = action.id
    button.dataset.boardItemAction = item.id
    button.setAttribute('aria-label', labels.itemAction(action.label, name))
    const icon = action.icon?.()
    if (icon) button.append(icon)
    else button.textContent = action.label
    return button
  }

  invalidate() {
    this.rendered.clear()
  }

  remove(id: string) {
    this.titles.get(id)?.remove()
    this.titles.delete(id)
    this.rendered.delete(id)
  }
}
