import { type Board, type BoardShapes, boardFocusOrder } from '@segnavia/format'

export interface BoardFocusStop {
  id: string
  action?: number
}

export interface BoardFocusFacts {
  order: readonly string[]
  actionCounts: Readonly<Record<string, number>>
  available: ReadonlySet<string>
  revealable: ReadonlySet<string>
}

interface FocusTarget {
  focus: () => void
}

function stops(facts: BoardFocusFacts): BoardFocusStop[] {
  return facts.order.flatMap((id) => [{ id }, ...Array.from({ length: facts.actionCounts[id] ?? 0 }, (_, action) => ({ id, action }))])
}

function sameStop(left: BoardFocusStop, right: BoardFocusStop): boolean {
  return left.id === right.id && left.action === right.action
}

/** The adjacent mounted or revealable stop in the board's modeled Tab order. */
export function adjacentBoardFocusStop(facts: BoardFocusFacts, current: BoardFocusStop | undefined, backwards: boolean): BoardFocusStop | undefined {
  if (!current && backwards) return undefined
  const ordered = stops(facts)
  const index = current ? ordered.findIndex((stop) => sameStop(stop, current)) : -1
  if (current && index < 0) return undefined
  const candidates = backwards ? ordered.slice(0, index).reverse() : ordered.slice(index + 1)
  return candidates.find((stop) => stop.action !== undefined || facts.available.has(stop.id) || facts.revealable.has(stop.id))
}

export function focusBoardByTab(
  board: Board | null,
  shapes: BoardShapes,
  canReveal: boolean,
  current: BoardFocusStop | undefined,
  backwards: boolean,
  entityNode: (id: string) => FocusTarget | undefined,
  actionNodes: (id: string) => readonly FocusTarget[],
  reveal: (id: string) => boolean,
): boolean {
  if (!board) return false
  const order = boardFocusOrder(board, shapes)
  const revealable = canReveal ? new Set(board.items.map((item) => item.id)) : new Set<string>()
  const available = new Set(order.filter((id) => entityNode(id)))
  const actions = Object.fromEntries(order.map((id) => [id, actionNodes(id)]))
  const actionCounts = Object.fromEntries(order.map((id) => [id, actions[id]?.length ?? 0]))
  const next = adjacentBoardFocusStop({ order, actionCounts, available, revealable }, current, backwards)
  if (!next) return false
  if (next.action !== undefined) actions[next.id]?.[next.action]?.focus()
  else entityNode(next.id)?.focus()
  return next.action !== undefined || available.has(next.id) || reveal(next.id)
}
