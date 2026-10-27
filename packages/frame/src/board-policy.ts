import {
  type BoardItem,
  type BoardView,
  type BookViewInput,
  type Deck,
  type ImpositionInput,
  MAX_BOARD_ZOOM,
  MIN_BOARD_ZOOM,
  type PageInput,
  type Point,
  type Size,
  zoomAt,
} from '@segnavia/format'
import type { ControllerOptions } from './controller.ts'

interface ResolvedBase {
  title?: string
  cover?: string
}

export type ResolvedBoardItem =
  | (ResolvedBase & { kind: 'deck'; deck: Deck; resolveSlide?: ControllerOptions['resolveSlide']; base?: string })
  | (ResolvedBase & { kind: 'page'; page: PageInput; size: Size })
  | (ResolvedBase & { kind: 'paper'; pages: PageInput[]; imposition: ImpositionInput; size: Size })
  | (ResolvedBase & { kind: 'book'; view: BookViewInput; size: Size })
  | (ResolvedBase & { kind: 'image'; src: string; width: number; height: number })
  | (ResolvedBase & { kind: 'shot'; src: string; width: number; height: number })

export type BoardTier = 'cover' | 'live'
export type BoardKeyAction = { kind: 'view'; view: BoardView } | { kind: 'fit' }
export const BOARD_ZOOM_FACTOR = 1.25

function checkSize(kind: ResolvedBoardItem['kind'], size: Size) {
  for (const field of ['width', 'height'] as const) {
    const value = size[field]
    if (!Number.isFinite(value) || value <= 0) throw new Error(`The resolved ${kind} size has a ${field} of ${value}; return a positive ${field}.`)
  }
}

export function checkResolved(item: BoardItem, resolved: ResolvedBoardItem): void {
  if (resolved.kind !== item.kind) throw new Error(`The resolved item kind is ${resolved.kind}, not ${item.kind}; return a resolved ${item.kind}.`)
  if (resolved.kind !== 'deck') checkSize(resolved.kind, resolvedShape(resolved))
}

export function resolvedShape(resolved: ResolvedBoardItem): Size {
  if (resolved.kind === 'deck') return resolved.deck.size
  if (resolved.kind === 'image' || resolved.kind === 'shot') return { width: resolved.width, height: resolved.height }
  return resolved.size
}

export function provisionalShape(kind: BoardItem['kind']): Size {
  if (kind === 'deck') return { width: 16, height: 9 }
  if (kind === 'page' || kind === 'paper' || kind === 'book') return { width: 1, height: Math.SQRT2 }
  return { width: 4, height: 3 }
}

export function boardTier(screenWidth: number, liveWidth: number): BoardTier {
  return screenWidth < liveWidth ? 'cover' : 'live'
}

export interface Pinch {
  midpoint: Point
  distance: number
}

// A pinch is the first two pointers down; the distance is at least 1 so a ratio of two pinches is always finite.
export function pinchOf(pointers: readonly Point[]): Pinch | null {
  const [a, b] = pointers
  if (!a || !b) return null
  return { midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }
}

export function shouldMountItem(mounted: boolean, withinHalfViewport: boolean, withinViewport: boolean): boolean {
  return mounted ? withinViewport : withinHalfViewport
}

export function shouldRefitReveal(pendingId: string | undefined, resolvedId: string | undefined, revealedHeight: number, resolvedHeight: number): boolean {
  return pendingId === resolvedId && revealedHeight !== resolvedHeight
}

function panned(view: BoardView, x: number, y: number): BoardView {
  return { ...view, pan: { x: view.pan.x + x, y: view.pan.y + y } }
}

export function keyToView(view: BoardView, key: string): BoardKeyAction | null {
  const x = view.viewport.width * 0.1
  const y = view.viewport.height * 0.1
  if (key === 'ArrowLeft') return { kind: 'view', view: panned(view, x, 0) }
  if (key === 'ArrowRight') return { kind: 'view', view: panned(view, -x, 0) }
  if (key === 'ArrowUp') return { kind: 'view', view: panned(view, 0, y) }
  if (key === 'ArrowDown') return { kind: 'view', view: panned(view, 0, -y) }
  if (key === '+' || key === '=') return { kind: 'view', view: zoomView(view, view.zoom * BOARD_ZOOM_FACTOR) }
  if (key === '-') return { kind: 'view', view: zoomView(view, view.zoom / BOARD_ZOOM_FACTOR) }
  if (key === '0') return { kind: 'fit' }
  return null
}

export function applyBoardKey(event: KeyboardEvent, view: BoardView, fitAll: () => void, setView: (view: BoardView) => void): void {
  const action = keyToView(view, event.key)
  if (!action) return
  event.preventDefault()
  if (action.kind === 'fit') fitAll()
  else setView(action.view)
}

export function zoomView(view: BoardView, zoom: number): BoardView {
  const point = { x: view.viewport.width / 2, y: view.viewport.height / 2 }
  const target = Number.isNaN(zoom) ? view.zoom : Math.min(MAX_BOARD_ZOOM, Math.max(MIN_BOARD_ZOOM, zoom))
  return zoomAt(view, point, target / view.zoom)
}
