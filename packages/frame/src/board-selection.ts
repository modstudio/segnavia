import type { BoardItem, BoardLabel } from '@segnavia/format'

export type BoardNode = BoardItem | BoardLabel

export interface BoardSelectionDetail {
  nodes: BoardNode[]
  node: BoardNode | null
  items: BoardItem[]
  item: BoardItem | null
  labels: BoardLabel[]
  label: BoardLabel | null
}

export function reconcileBoardSelection(selection: readonly string[], items: readonly BoardNode[]): string[] {
  const selected = new Set(selection)
  return items.flatMap((item) => (selected.has(item.id) ? [item.id] : []))
}

export function selectBoardNode(selection: readonly string[], id: string, toggle: boolean): string[] {
  if (!toggle) return [id]
  return selection.includes(id) ? selection.filter((entry) => entry !== id) : [...selection, id]
}

export class BoardSelection {
  private value: string[] = []

  constructor(
    private readonly host: HTMLElement,
    private readonly items: () => ReadonlyMap<string, BoardItem>,
    private readonly labels: () => ReadonlyMap<string, BoardLabel>,
    private readonly nodes: () => ReadonlyMap<string, HTMLElement>,
  ) {}

  get selection(): readonly string[] {
    return [...this.value]
  }

  set selection(value: readonly string[]) {
    this.set(reconcileBoardSelection(value, [...this.items().values(), ...this.labels().values()]))
  }

  reconcile() {
    this.set(reconcileBoardSelection(this.value, [...this.items().values(), ...this.labels().values()]))
  }

  mount(node: HTMLElement, id: string) {
    this.update(node, id)
  }

  private set(value: string[]) {
    if (value.length === this.value.length && value.every((id, index) => id === this.value[index])) return
    this.value = value
    for (const [id, node] of this.nodes()) this.update(node, id)
    const items = value.flatMap((id) => (this.items().get(id) ? [this.items().get(id) as BoardItem] : []))
    const labels = value.flatMap((id) => (this.labels().get(id) ? [this.labels().get(id) as BoardLabel] : []))
    const nodes = value.flatMap((id) => {
      const node = this.items().get(id) ?? this.labels().get(id)
      return node ? [node] : []
    })
    this.host.dispatchEvent(
      new CustomEvent<BoardSelectionDetail>('segnavia-board-selection', {
        detail: { nodes, node: nodes[0] ?? null, items, item: items[0] ?? null, labels, label: labels[0] ?? null },
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
