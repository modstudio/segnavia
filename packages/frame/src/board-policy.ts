import {
  type BoardItem,
  type BoardItemFact,
  type BoardView,
  type BookViewInput,
  type Deck,
  type Document,
  type DocumentInput,
  deckFromDocument,
  type ImpositionInput,
  MAX_BOARD_ZOOM,
  MIN_BOARD_ZOOM,
  PAGE_OR_PRINTED_KINDS,
  type Page,
  type PixelSize,
  type Point,
  pageOrPrintedFromDocument,
  zoomAt,
} from '@segnavia/format'
import { type PlacementReport, parseDocument, type ResolvedPlacement, type ResolvePlacement } from '@segnavia/html'
import type { ControllerOptions } from './controller.ts'
import { type DesignedCover, type ParsedDesignedCover, parseDesignedCover } from './designed-cover-policy.ts'

interface ResolvedBase {
  title?: string
  cover?: string
  designedCover?: DesignedCover
}

export type ResolvedBoardItem =
  | (ResolvedBase & { kind: 'deck'; deck: DocumentInput; resolveSlide?: ControllerOptions['resolveSlide']; base?: string })
  | (ResolvedBase & { kind: 'page'; page: DocumentInput; size: PixelSize })
  | (ResolvedBase & { kind: 'paper'; pages: DocumentInput[]; imposition: ImpositionInput; size: PixelSize })
  | (ResolvedBase & { kind: 'book'; view: BookViewInput; size: PixelSize })
  | (ResolvedBase & { kind: 'image'; src: string; width: number; height: number })
  | (ResolvedBase & { kind: 'shot'; src: string; width: number; height: number })

type WithoutDesignedCover<T> = T extends { designedCover?: DesignedCover } ? Omit<T, 'designedCover'> : T
export type ResolvedAsset = ResolvedPlacement | WithoutDesignedCover<Exclude<ResolvedBoardItem, { kind: 'image' | 'page' }>>
export type AssetResolver = ResolvePlacement<ResolvedAsset>
export type AssetPlacementsOptions = { resolve: AssetResolver; report?: PlacementReport }

export type CheckedResolvedBoardItem =
  | (ResolvedBase & { kind: 'deck'; deck: Deck; resolveSlide?: ControllerOptions['resolveSlide']; base?: string; designedCover?: ParsedDesignedCover })
  | (ResolvedBase & { kind: 'page'; page: Page; size: PixelSize; designedCover?: ParsedDesignedCover })
  | (ResolvedBase & { kind: 'paper'; pages: Page[]; imposition: ImpositionInput; size: PixelSize; designedCover?: ParsedDesignedCover })
  | (ResolvedBase & { kind: 'book'; view: BookViewInput; size: PixelSize; designedCover?: ParsedDesignedCover })
  | (ResolvedBase & { kind: 'image'; src: string; width: number; height: number; designedCover?: ParsedDesignedCover })
  | (ResolvedBase & { kind: 'shot'; src: string; width: number; height: number; designedCover?: ParsedDesignedCover })

export type BoardTier = 'cover' | 'live'
export type BoardKeyAction = { kind: 'view'; view: BoardView } | { kind: 'fit' }
export const BOARD_ZOOM_FACTOR = 1.25

function checkSize(kind: ResolvedBoardItem['kind'], size: PixelSize) {
  for (const field of ['width', 'height'] as const) {
    const value = size[field]
    if (!Number.isFinite(value) || value <= 0) throw new Error(`The resolved ${kind} size has a ${field} of ${value}; return a positive ${field}.`)
  }
}

export function checkResolved(item: BoardItem, resolved: ResolvedBoardItem): CheckedResolvedBoardItem {
  const expected = item.kind === 'media' ? 'image' : item.kind
  if (resolved.kind !== expected) throw new Error(`The resolved item kind is ${resolved.kind}, not ${expected}; return a resolved ${expected}.`)
  if (resolved.kind === 'image' || resolved.kind === 'shot') checkSize(resolved.kind, { width: resolved.width, height: resolved.height })
  else if (resolved.kind !== 'deck') checkSize(resolved.kind, resolved.size)
  const designedCover = resolved.designedCover && parseDesignedCover(resolved.designedCover, `The resolved board item "${item.id}"`)
  if (resolved.kind === 'deck') return { ...resolved, deck: deckFromDocument(resolvedDocument(item, resolved.deck, ['deck'])), designedCover }
  if (resolved.kind === 'page')
    return { ...resolved, page: pageOrPrintedFromDocument(resolvedDocument(item, resolved.page, PAGE_OR_PRINTED_KINDS)), designedCover }
  if (resolved.kind === 'paper') {
    const pages = resolved.pages.map((page) => {
      const document = resolvedDocument(item, page, PAGE_OR_PRINTED_KINDS)
      return pageOrPrintedFromDocument(document)
    })
    return { ...resolved, pages, designedCover }
  }
  return { ...resolved, designedCover } as CheckedResolvedBoardItem
}

function resolvedDocument(item: BoardItem, input: DocumentInput, accepted: readonly Document['kind'][]): Document {
  const document = parseDocument(input)
  if (!accepted.includes(document.kind)) {
    throw new Error(
      `The resolved board item "${item.id}" has document kind ${document.kind}, not ${accepted.join(' or ')}; return kind ${accepted.join(' or ')} to clear this refusal.`,
    )
  }
  return document
}

export function boardItemFact(resolved: CheckedResolvedBoardItem): BoardItemFact {
  if (resolved.kind === 'image') return { kind: 'media', size: { width: resolved.width, height: resolved.height } }
  if (resolved.kind === 'deck') return { kind: 'deck', deck: resolved.deck }
  if (resolved.kind === 'shot') return { kind: 'shot', size: { width: resolved.width, height: resolved.height } }
  return { kind: resolved.kind, size: resolved.size }
}

export function boardShapeFacts(
  items: readonly BoardItem[],
  resolved: (address: string) => CheckedResolvedBoardItem | undefined,
): Record<string, BoardItemFact> {
  return Object.fromEntries(
    items.flatMap((item) => {
      const value = resolved(item.address)
      return value ? [[item.address, boardItemFact(value)]] : []
    }),
  )
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
