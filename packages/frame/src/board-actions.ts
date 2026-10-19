import type { BoardItem } from '@segnavia/format'

export type BoardItemKind = BoardItem['kind']

export interface BoardItemAction {
  id: string
  label: string
  icon?: () => Node
  kinds?: readonly BoardItemKind[]
}

export function actionsForKind(actions: readonly BoardItemAction[], kind: BoardItemKind): readonly BoardItemAction[] {
  return actions.filter((action) => action.kinds === undefined || action.kinds.includes(kind))
}
