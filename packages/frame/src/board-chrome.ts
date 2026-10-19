import type { BoardItem } from '@segnavia/format'
import type { BoardItemAction, BoardItemKind } from './board-actions.ts'
import type { BoardItemTitles } from './board-titles.ts'
import { type BoardLabels, boardLabels } from './labels.ts'

export class BoardChrome {
  kindIcon: ((kind: BoardItemKind) => Node | null | undefined) | undefined
  itemActions: readonly BoardItemAction[] = []
  private labelOverrides: Partial<BoardLabels> = {}
  private resolvedLabels = boardLabels({})

  constructor(
    private readonly titles: BoardItemTitles,
    private readonly items: () => readonly BoardItem[],
    private readonly mounted: (id: string) => boolean,
    private readonly name: (id: string) => string,
    private readonly direction: () => 'ltr' | 'rtl',
  ) {}

  render(item: BoardItem) {
    this.titles.content(item, this.name(item.id), this.direction(), this.kindIcon, this.itemActions, this.resolvedLabels)
  }

  get labels(): Partial<BoardLabels> {
    return this.labelOverrides
  }

  set labels(value: Partial<BoardLabels>) {
    this.labelOverrides = value
    this.resolvedLabels = boardLabels(value)
  }

  refresh() {
    this.titles.invalidate()
    for (const item of this.items()) if (this.mounted(item.id)) this.render(item)
  }
}
