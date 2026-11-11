import type { BoardItem, BoardLabel, BoardSection } from '@segnavia/format'

export type BoardSelectionEntry = { kind: 'item'; item: BoardItem } | { kind: 'label'; label: BoardLabel } | { kind: 'section'; section: BoardSection }

export interface BoardSelectionDetail {
  entries: BoardSelectionEntry[]
  entry: BoardSelectionEntry | null
  items: BoardItem[]
  item: BoardItem | null
  labels: BoardLabel[]
  label: BoardLabel | null
  sections: BoardSection[]
  section: BoardSection | null
}

export function reconcileBoardSelection(selection: readonly string[], items: readonly { id: string }[]): string[] {
  const present = new Set(items.map((item) => item.id))
  return [...new Set(selection)].filter((id) => present.has(id))
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
    private readonly sections: () => ReadonlyMap<string, BoardSection>,
    private readonly nodes: () => ReadonlyMap<string, HTMLElement>,
    private readonly markDecorationSelected: (id: string, selected: boolean) => void,
  ) {}

  get selection(): readonly string[] {
    return [...this.value]
  }

  set selection(value: readonly string[]) {
    this.set(reconcileBoardSelection(value, [...this.items().values(), ...this.labels().values(), ...this.sections().values()]))
  }

  reconcile() {
    this.set(reconcileBoardSelection(this.value, [...this.items().values(), ...this.labels().values(), ...this.sections().values()]))
  }

  mount(node: HTMLElement, id: string) {
    this.update(node, id)
    this.markDecorationSelected(id, this.value.includes(id))
  }

  private set(value: string[]) {
    if (value.length === this.value.length && value.every((id, index) => id === this.value[index])) return
    this.value = value
    for (const [id, node] of this.nodes()) this.update(node, id)
    for (const id of this.sections().keys()) this.markDecorationSelected(id, value.includes(id))
    const items = value.flatMap((id) => (this.items().get(id) ? [this.items().get(id) as BoardItem] : []))
    const labels = value.flatMap((id) => (this.labels().get(id) ? [this.labels().get(id) as BoardLabel] : []))
    const sections = value.flatMap((id) => (this.sections().get(id) ? [this.sections().get(id) as BoardSection] : []))
    const entries = value.flatMap((id): BoardSelectionEntry[] => {
      const item = this.items().get(id)
      if (item) return [{ kind: 'item', item }]
      const label = this.labels().get(id)
      if (label) return [{ kind: 'label', label }]
      const section = this.sections().get(id)
      return section ? [{ kind: 'section', section }] : []
    })
    this.host.dispatchEvent(
      new CustomEvent<BoardSelectionDetail>('segnavia-board-selection', {
        detail: {
          entries,
          entry: entries[0] ?? null,
          items,
          item: items[0] ?? null,
          labels,
          label: labels[0] ?? null,
          sections,
          section: sections[0] ?? null,
        },
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
