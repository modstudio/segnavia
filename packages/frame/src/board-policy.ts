import type { BoardItem, BoardView, BookViewInput, Deck, ImpositionInput, PageInput, Size } from '@segnavia/format'
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
  return 'cover'
}

export function shouldMountItem(mounted: boolean, withinHalfViewport: boolean, withinViewport: boolean): boolean {
  return mounted ? withinViewport : withinHalfViewport
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
  if (key === '+' || key === '=') return { kind: 'view', view: zoomAtCentre(view, 1.25) }
  if (key === '-') return { kind: 'view', view: zoomAtCentre(view, 1 / 1.25) }
  if (key === '0') return { kind: 'fit' }
  return null
}

function zoomAtCentre(view: BoardView, factor: number): BoardView {
  const point = { x: view.viewport.width / 2, y: view.viewport.height / 2 }
  const zoom = Math.min(8, Math.max(0.05, view.zoom * factor))
  const boardX = (point.x - view.pan.x) / view.zoom
  const boardY = (point.y - view.pan.y) / view.zoom
  return { ...view, zoom, pan: { x: point.x - boardX * zoom, y: point.y - boardY * zoom } }
}
