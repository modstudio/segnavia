import type { Board, BoardCommand } from '@segnavia/format'

export interface BoardRemoval {
  commands: BoardCommand[]
  removed: string[]
  selection: string[]
}

export function boardRemoval(board: Board, ids: readonly string[]): BoardRemoval | undefined {
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
  const removedItems = new Set(items.map((item) => item.id))
  const selection = [...new Set(sections.flatMap((section) => section.items))].filter((id) => !removedItems.has(id))
  return { commands, removed, selection }
}
