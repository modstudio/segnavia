import type { BoardItem } from '@segnavia/format'

export function reconcileBoardSelection(selected: string | null, items: readonly BoardItem[]): string | null {
  return selected !== null && items.some((item) => item.id === selected) ? selected : null
}

export class BoardSelection {
  private value: string | null = null

  constructor(
    private readonly host: HTMLElement,
    private readonly items: () => ReadonlyMap<string, BoardItem>,
    private readonly nodes: () => ReadonlyMap<string, HTMLElement>,
  ) {}

  get selected(): string | null {
    return this.value
  }

  set selected(value: string | null) {
    this.set(reconcileBoardSelection(value, [...this.items().values()]))
  }

  reconcile() {
    this.set(reconcileBoardSelection(this.value, [...this.items().values()]))
  }

  mount(node: HTMLElement, id: string) {
    this.update(node, id)
  }

  private set(value: string | null) {
    if (value === this.value) return
    this.value = value
    for (const [id, node] of this.nodes()) this.update(node, id)
    this.host.dispatchEvent(
      new CustomEvent('segnavia-board-selection', { detail: { item: value ? (this.items().get(value) ?? null) : null }, bubbles: true, composed: true }),
    )
  }

  private update(node: HTMLElement, id: string) {
    const selected = id === this.value
    node.toggleAttribute('data-selected', selected)
    if (selected) node.part.add('selected')
    else node.part.remove('selected')
  }
}
