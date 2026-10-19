import type { BoardItem } from '@segnavia/format'

export function reconcileBoardSelection(selection: readonly string[], items: readonly BoardItem[]): string[] {
  const selected = new Set(selection)
  return items.flatMap((item) => (selected.has(item.id) ? [item.id] : []))
}

export function selectBoardItem(selection: readonly string[], id: string, toggle: boolean): string[] {
  if (!toggle) return [id]
  return selection.includes(id) ? selection.filter((entry) => entry !== id) : [...selection, id]
}

export class BoardSelection {
  private value: string[] = []

  constructor(
    private readonly host: HTMLElement,
    private readonly items: () => ReadonlyMap<string, BoardItem>,
    private readonly nodes: () => ReadonlyMap<string, HTMLElement>,
  ) {}

  get selection(): readonly string[] {
    return [...this.value]
  }

  set selection(value: readonly string[]) {
    this.set(reconcileBoardSelection(value, [...this.items().values()]))
  }

  reconcile() {
    this.set(reconcileBoardSelection(this.value, [...this.items().values()]))
  }

  mount(node: HTMLElement, id: string) {
    this.update(node, id)
  }

  private set(value: string[]) {
    if (value.length === this.value.length && value.every((id, index) => id === this.value[index])) return
    this.value = value
    for (const [id, node] of this.nodes()) this.update(node, id)
    const items = value.flatMap((id) => (this.items().get(id) ? [this.items().get(id) as BoardItem] : []))
    this.host.dispatchEvent(
      new CustomEvent('segnavia-board-selection', {
        detail: { items, item: items[0] ?? null },
        bubbles: true,
        composed: true,
      }),
    )
  }

  private update(node: HTMLElement, id: string) {
    const selected = this.value.includes(id)
    node.toggleAttribute('data-selected', selected)
    if (selected) node.part.add('selected')
    else node.part.remove('selected')
  }
}
