import { type Board, type BoardCommand, releasedSectionMembers } from '@segnavia/format'

export interface BoardRemoval {
  commands: BoardCommand[]
  removed: string[]
  selection: string[]
}

export function boardRemoval(board: Board, ids: readonly string[], priorSelection: readonly string[] = []): BoardRemoval | undefined {
  const requested = new Set(ids)
  const sections = board.sections.filter((section) => requested.has(section.id))
  const labels = board.labels.filter((label) => requested.has(label.id))
  const items = board.items.filter((item) => requested.has(item.id))
  const removed = [...sections, ...labels, ...items].map((entry) => entry.id)
  if (removed.length === 0) return undefined
  const commands: BoardCommand[] = [
    ...sections.map((section): BoardCommand => ({ type: 'section-remove', section: { id: section.id }, members: 'release' })),
    ...(labels.length ? ([{ type: 'label-remove', labels: labels.map((label) => ({ id: label.id })) }] satisfies BoardCommand[]) : []),
    ...(items.length ? ([{ type: 'item-remove', items: items.map((item) => ({ id: item.id })) }] satisfies BoardCommand[]) : []),
  ]
  const removedSet = new Set(removed)
  const released = releasedSectionMembers(board, new Set(sections.map((section) => section.id))).filter((id) => !removedSet.has(id))
  const selection = [...new Set([...priorSelection.filter((id) => !removedSet.has(id)), ...released])]
  return { commands, removed, selection }
}

interface BoardRemovalHost {
  selection: readonly string[]
  focus(): void
}

/** Applies a removal before exposing its derived selection to the board. */
export function removeBoardEntities(board: Board, ids: readonly string[], host: BoardRemovalHost, apply: (removal: BoardRemoval) => boolean): void {
  const removal = boardRemoval(board, ids, host.selection)
  if (!removal || !apply(removal)) return
  host.selection = removal.selection
  host.focus()
}
