import type { Board, BoardItem } from '@segnavia/format'
import type { BoardItemTitles } from './board-titles.ts'

export class BoardMounts {
  readonly nodes = new Map<string, HTMLElement>()

  constructor(
    private readonly surface: HTMLElement,
    private readonly titles: BoardItemTitles,
    private readonly mounted: (node: HTMLElement, id: string) => void,
    private readonly removed: (id: string) => void,
  ) {}

  mount(item: BoardItem): HTMLElement {
    const node = document.createElement('div')
    node.part.add('item')
    node.dataset.boardItem = item.id
    node.tabIndex = 0
    node.setAttribute('role', 'button')
    this.nodes.set(item.id, node)
    this.surface.append(node)
    this.titles.mount(item.id, node)
    this.mounted(node, item.id)
    return node
  }

  unmount(id: string) {
    this.nodes.get(id)?.remove()
    this.nodes.delete(id)
    this.titles.remove(id)
    this.removed(id)
  }

  clear() {
    for (const id of this.nodes.keys()) this.unmount(id)
  }

  reconcile(previous: Board | null, current: Board | null) {
    const before = new Map(previous?.items.map((item) => [item.id, item]) ?? [])
    const after = new Map(current?.items.map((item) => [item.id, item]) ?? [])
    for (const id of this.nodes.keys()) {
      const oldItem = before.get(id)
      const newItem = after.get(id)
      if (!oldItem || !newItem || oldItem.address !== newItem.address || oldItem.kind !== newItem.kind) this.unmount(id)
    }
  }
}
