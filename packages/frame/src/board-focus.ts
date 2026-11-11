import { type Board, type BoardShapes, boardFocusOrder } from '@segnavia/format'
import { focusAfterReveal } from './board-reveal.ts'

export interface BoardFocusStop {
  id: string
  action?: number
}

export interface BoardFocusFacts {
  order: readonly string[]
  actionCounts: Readonly<Record<string, number>>
  available: ReadonlySet<string>
  needsReveal: ReadonlySet<string>
}

export type BoardFocusDecision = { kind: 'stop'; stop: BoardFocusStop } | { kind: 'exit' }

interface FocusTarget {
  focus: () => void
}

interface BoardFocusAdapterFacts {
  board: () => Board | null
  shapes: () => BoardShapes
  canReveal: () => boolean
  entityNode: (id: string) => FocusTarget | undefined
  actionNodes: (id: string) => readonly FocusTarget[]
  reveal: (id: string) => boolean
}

export class BoardFocusAdapter {
  constructor(
    private readonly host: HTMLElement,
    private readonly facts: BoardFocusAdapterFacts,
  ) {}

  focus(id?: string) {
    if (id) this.facts.entityNode(id)?.focus()
    else this.host.focus()
  }

  byTab(current: BoardFocusStop | undefined, backwards: boolean): boolean {
    return focusBoardByTab(
      this.facts.board(),
      this.facts.shapes(),
      this.facts.canReveal(),
      current,
      backwards,
      this.facts.entityNode,
      this.facts.actionNodes,
      this.facts.reveal,
      (reverse) => focusAdjacentToBoard(this.host, reverse),
    )
  }

  afterReveal(id: string) {
    focusAfterReveal(() => this.facts.entityNode(id)?.focus())
  }
}

function stops(facts: BoardFocusFacts): BoardFocusStop[] {
  return facts.order.flatMap((id) => [{ id }, ...Array.from({ length: facts.actionCounts[id] ?? 0 }, (_, action) => ({ id, action }))])
}

function sameStop(left: BoardFocusStop, right: BoardFocusStop): boolean {
  return left.id === right.id && left.action === right.action
}

/** The adjacent usable stop, or an explicit exit from the modeled board order. */
export function adjacentBoardFocusStop(facts: BoardFocusFacts, current: BoardFocusStop | undefined, backwards: boolean): BoardFocusDecision | undefined {
  if (!current && backwards) return undefined
  const ordered = stops(facts)
  const index = current ? ordered.findIndex((stop) => sameStop(stop, current)) : -1
  if (current && index < 0) return undefined
  const candidates = backwards ? ordered.slice(0, index).reverse() : ordered.slice(index + 1)
  const stop = candidates.find((entry) => entry.action !== undefined || facts.available.has(entry.id) || facts.needsReveal.has(entry.id))
  return stop ? { kind: 'stop', stop } : current ? { kind: 'exit' } : undefined
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
  exit: (backwards: boolean) => void,
): boolean {
  if (!board) return false
  const order = boardFocusOrder(board, shapes)
  const needsReveal = canReveal ? new Set(board.items.map((item) => item.id)) : new Set<string>()
  const available = new Set(order.filter((id) => entityNode(id)))
  const actions = Object.fromEntries(order.map((id) => [id, actionNodes(id)]))
  const actionCounts = Object.fromEntries(order.map((id) => [id, actions[id]?.length ?? 0]))
  const decision = adjacentBoardFocusStop({ order, actionCounts, available, needsReveal }, current, backwards)
  if (!decision) return false
  if (decision.kind === 'exit') {
    exit(backwards)
    return true
  }
  const next = decision.stop
  if (next.action !== undefined) actions[next.id]?.[next.action]?.focus()
  else entityNode(next.id)?.focus()
  return next.action !== undefined || available.has(next.id) || reveal(next.id)
}

const FOCUSABLE = 'a[href],button,input,select,textarea,summary,iframe,[tabindex],[contenteditable="true"],audio[controls],video[controls]'

function usable(node: HTMLElement, board: HTMLElement): boolean {
  return node !== board && !board.contains(node) && node.tabIndex >= 0 && !node.hasAttribute('disabled') && !node.hasAttribute('inert') && !node.hidden
}

/** Focuses the outer tab stop immediately before or after the board. */
export function focusAdjacentToBoard(board: HTMLElement, backwards: boolean): void {
  let anchor: HTMLElement = board
  let root = anchor.getRootNode() as Document | ShadowRoot
  while (root) {
    const candidates = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => usable(node, board))
    const adjacent = backwards
      ? candidates.filter((node) => Boolean(node.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1)
      : candidates.find((node) => Boolean(anchor.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING))
    if (adjacent) {
      adjacent.focus()
      return
    }
    const outerHost = 'host' in root && root.host instanceof HTMLElement ? root.host : undefined
    if (!outerHost) break
    anchor = outerHost
    root = anchor.getRootNode() as Document | ShadowRoot
  }
  board.blur()
}
