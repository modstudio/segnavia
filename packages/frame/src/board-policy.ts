import {
  type BoardItem,
  type BoardItemFact,
  type BoardView,
  type BookViewInput,
  type Brand,
  type Deck,
  type Document,
  type DocumentInput,
  deckFromDocument,
  type ImpositionInput,
  MAX_BOARD_ZOOM,
  type MeasuredSize,
  MIN_BOARD_ZOOM,
  PAGE_OR_PRINTED_KINDS,
  type Page,
  type PixelSize,
  type Point,
  pageOrPrintedFromDocument,
  revealView,
  zoomAt,
} from '@segnavia/format'
import { type PlacementsOptions, parseDocument, type ResolvedPlacement, type ResolvePlacement } from '@segnavia/html'
import type { RevealTarget } from './board-reveal.ts'
import type { ControllerOptions } from './controller.ts'
import { type DesignedCover, type ParsedDesignedCover, parseDesignedCover } from './designed-cover-policy.ts'

export interface PendingReveal {
  id: string
  height: number
  maxZoom: number
}

export interface RevealRequest {
  view: BoardView
  pendingReveal: PendingReveal | undefined
}

export function checkRevealMaxZoom(value: number): number {
  if (!Number.isFinite(value) || value < MIN_BOARD_ZOOM || value > MAX_BOARD_ZOOM) {
    throw new RangeError(`Reveal maxZoom is ${value}; provide a finite value from ${MIN_BOARD_ZOOM} through ${MAX_BOARD_ZOOM}.`)
  }
  return value
}

export function effectiveRevealMaxZoom(callMaxZoom?: number, boardMaxZoom?: number): number {
  const maxZoom = callMaxZoom !== undefined ? callMaxZoom : boardMaxZoom !== undefined ? boardMaxZoom : MAX_BOARD_ZOOM
  return checkRevealMaxZoom(maxZoom)
}

export function revealRequest(target: RevealTarget, viewport: MeasuredSize, maxZoom: number): RevealRequest {
  const checkedMaxZoom = checkRevealMaxZoom(maxZoom)
  return {
    view: revealView(target.bounds, viewport, 48, { maxZoom: checkedMaxZoom }),
    pendingReveal: target.kind === 'item' ? { id: target.item.id, height: target.bounds.height, maxZoom: checkedMaxZoom } : undefined,
  }
}

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

export interface UnavailableBoardItem {
  kind: ResolvedBoardItem['kind']
  state: 'withheld' | 'gone'
  size?: PixelSize
  label?: string
}

type WithoutDesignedCover<T> = T extends { designedCover?: DesignedCover } ? Omit<T, 'designedCover'> : T
export type ResolvedAsset = ResolvedPlacement | WithoutDesignedCover<Exclude<ResolvedBoardItem, { kind: 'image' | 'page' }>>
export type AssetResolver = ResolvePlacement<ResolvedAsset>
export type AssetPlacementsOptions = PlacementsOptions<ResolvedAsset>

type CheckedResolvedBase = Omit<ResolvedBase, 'designedCover'> & { designedCover?: ParsedDesignedCover }

export type CheckedResolvedBoardItem =
  | (CheckedResolvedBase & { kind: 'deck'; deck: Deck; resolveSlide?: ControllerOptions['resolveSlide']; base?: string })
  | (CheckedResolvedBase & { kind: 'page'; page: Page; size: PixelSize })
  | (CheckedResolvedBase & { kind: 'paper'; pages: Page[]; imposition: ImpositionInput; size: PixelSize })
  | (CheckedResolvedBase & { kind: 'book'; view: BookViewInput; size: PixelSize })
  | (CheckedResolvedBase & { kind: 'image'; src: string; width: number; height: number })
  | (CheckedResolvedBase & { kind: 'shot'; src: string; width: number; height: number })

export type BoardResolutionOutcome =
  | { status: 'pending' }
  | { status: 'resolved'; value: CheckedResolvedBoardItem }
  | { status: 'unavailable'; value: UnavailableBoardItem }
  | { status: 'failed' }

export type BoardTier = 'cover' | 'live'
export type BoardKeyAction = { kind: 'view'; view: BoardView } | { kind: 'fit' }
export const BOARD_ZOOM_FACTOR = 1.25

function checkSize(kind: ResolvedBoardItem['kind'], size: PixelSize) {
  for (const field of ['width', 'height'] as const) {
    const value = size[field]
    if (!Number.isFinite(value) || value <= 0) throw new Error(`The resolved ${kind} size has a ${field} of ${value}; return a positive ${field}.`)
  }
}

function expectedAnswerKind(item: BoardItem): ResolvedBoardItem['kind'] {
  if (item.kind === 'sound') throw new Error(`The sound at ${item.address} has no board face.`)
  return item.kind === 'media' ? 'image' : item.kind
}

function kindMismatch(actual: ResolvedBoardItem['kind'], expected: ResolvedBoardItem['kind']): Error {
  return new Error(`The resolved item kind is ${actual}, not ${expected}; return a resolved ${expected}.`)
}

export function checkUnavailable(item: BoardItem, unavailable: UnavailableBoardItem): UnavailableBoardItem {
  const expected = expectedAnswerKind(item)
  if (unavailable.kind !== expected) throw kindMismatch(unavailable.kind, expected)
  if (unavailable.state !== 'withheld' && unavailable.state !== 'gone')
    throw new Error(`The unavailable item state is ${unavailable.state}, not withheld or gone; return state withheld or gone.`)
  if (unavailable.size) checkSize(unavailable.kind, unavailable.size)
  return unavailable
}

type ResolveBoardBrand = (document?: Document) => Promise<Brand | undefined>

export function checkResolved(item: BoardItem, resolved: ResolvedBoardItem): CheckedResolvedBoardItem
export function checkResolved(item: BoardItem, resolved: ResolvedBoardItem, resolveItemBrand: ResolveBoardBrand): Promise<CheckedResolvedBoardItem>
export function checkResolved(
  item: BoardItem,
  resolved: ResolvedBoardItem,
  resolveItemBrand?: ResolveBoardBrand,
): CheckedResolvedBoardItem | Promise<CheckedResolvedBoardItem> {
  const expected = expectedAnswerKind(item)
  if (resolved.kind !== expected) throw kindMismatch(resolved.kind, expected)
  if (resolved.kind === 'image' || resolved.kind === 'shot') checkSize(resolved.kind, { width: resolved.width, height: resolved.height })
  else if (resolved.kind !== 'deck') checkSize(resolved.kind, resolved.size)
  const designedCover = resolved.designedCover && parseDesignedCover(resolved.designedCover, `The resolved board item "${item.id}"`)
  if (resolved.kind === 'deck') {
    const document = resolvedDocument(item, resolved.deck, ['deck'])
    const lower = (brand?: Brand) => ({ ...resolved, deck: deckFromDocument(document, brand), designedCover })
    return resolveItemBrand ? resolveItemBrand(document).then(lower) : lower()
  }
  if (resolved.kind === 'page') {
    const document = resolvedDocument(item, resolved.page, PAGE_OR_PRINTED_KINDS)
    const lower = (brand?: Brand) => ({ ...resolved, page: pageOrPrintedFromDocument(document, brand), designedCover })
    return resolveItemBrand ? resolveItemBrand(document).then(lower) : lower()
  }
  if (resolved.kind === 'paper') {
    const documents = resolved.pages.map((page) => resolvedDocument(item, page, PAGE_OR_PRINTED_KINDS))
    if (resolveItemBrand) {
      return Promise.all(documents.map(async (document) => pageOrPrintedFromDocument(document, await resolveItemBrand(document)))).then((pages) => ({
        ...resolved,
        pages,
        designedCover,
      }))
    }
    return { ...resolved, pages: documents.map((document) => pageOrPrintedFromDocument(document)), designedCover }
  }
  const checked = { ...resolved, designedCover } as CheckedResolvedBoardItem
  if (checked.kind === 'book' && checked.view.brand === undefined && resolveItemBrand) {
    return resolveItemBrand().then((brand) => ({ ...checked, view: { ...checked.view, brand } }))
  }
  return resolveItemBrand ? Promise.resolve(checked) : checked
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

export function boardItemFact(outcome: BoardResolutionOutcome): BoardItemFact | undefined {
  if (outcome.status !== 'resolved' && outcome.status !== 'unavailable') return undefined
  let kind: ResolvedBoardItem['kind']
  let size: PixelSize | undefined
  let deck: Extract<BoardItemFact, { kind: 'deck' }>['deck'] | undefined
  if (outcome.status === 'unavailable') {
    kind = outcome.value.kind
    size = outcome.value.size
    if (!size) return undefined
    if (kind === 'deck') deck = { size }
  } else {
    kind = outcome.value.kind
    if (outcome.value.kind === 'deck') deck = outcome.value.deck
    else if (outcome.value.kind === 'image' || outcome.value.kind === 'shot') size = { width: outcome.value.width, height: outcome.value.height }
    else size = outcome.value.size
  }
  if (kind === 'deck') return deck ? { kind: 'deck', deck } : undefined
  if (!size) return undefined
  const factKind = kind === 'image' ? 'media' : kind
  return { kind: factKind, size } as BoardItemFact
}

export function boardShapeFacts(items: readonly BoardItem[], outcome: (address: string) => BoardResolutionOutcome): Record<string, BoardItemFact> {
  return Object.fromEntries(
    items.flatMap((item) => {
      const fact = boardItemFact(outcome(item.address))
      return fact ? [[item.address, fact]] : []
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
