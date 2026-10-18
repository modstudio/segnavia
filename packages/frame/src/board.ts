import {
  Board,
  type BoardItem,
  type BoardShapes,
  type BoardView,
  boardBounds,
  itemAt,
  itemHeight,
  revealView,
  screenToBoard,
  visibleItems,
  zoomToFit,
} from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { BoardDecorations } from './board-decorations.ts'
import { BoardGestures } from './board-gestures.ts'
import { liveBoardItem } from './board-live.ts'
import { type BoardItemNames, BoardNames } from './board-names.ts'
import { placeBoardNode } from './board-placement.ts'
import { boardTier, checkResolved, keyToView, provisionalShape, type ResolvedBoardItem, resolvedShape, shouldMountItem } from './board-policy.ts'
import { BoardItemTitles } from './board-titles.ts'

interface CacheEntry {
  promise?: Promise<void>
  value?: ResolvedBoardItem
  error?: unknown
  failed?: boolean
}

export type ResolveBoardItem = (item: BoardItem) => Promise<ResolvedBoardItem>
export class SegnaviaBoard extends HTMLElement {
  private value: Board | null = null
  private currentView: BoardView = { zoom: 1, pan: { x: 0, y: 0 }, viewport: { width: 0, height: 0 } }
  private viewWasSet = false
  private initialFitDone = false
  private threshold = 240
  private resolver: ResolveBoardItem | undefined
  private nameProvider: BoardItemNames | undefined
  private shapes: BoardShapes = { items: {}, labels: {} }
  private items = new Map<string, BoardItem>()
  private readonly cache = new Map<string, CacheEntry>()
  private readonly nodes = new Map<string, HTMLElement>()
  private readonly tiers = new Map<string, 'cover' | 'live'>()
  private readonly painted = new Map<string, ResolvedBoardItem | undefined>()
  private readonly disposals = new Map<string, () => void>()
  private viewEvent = 0
  private readonly root = this.attachShadow({ mode: 'open' })
  private readonly surface = document.createElement('div')
  private readonly decorations = new BoardDecorations(this.surface)
  private readonly titles = new BoardItemTitles(this.surface)
  private readonly names = new BoardNames(
    () => {
      this.render()
      this.dispatchEvent(new CustomEvent('segnavia-board-names', { bubbles: true, composed: true }))
    },
    (items, error) => this.dispatchEvent(new CustomEvent('segnavia-board-error', { detail: { items, error }, bubbles: true, composed: true })),
  )
  private readonly gestures = new BoardGestures(
    this,
    () => this.currentView,
    (view) => this.setView(view),
  )
  private readonly resize = new ResizeObserver(() => this.measure())

  constructor() {
    super()
    this.surface.part.add('surface')
    this.surface.dir = 'ltr'
    this.root.append(this.surface)
  }

  get board(): Board | null {
    return this.value
  }

  set board(input: Board | null) {
    const previous = this.value
    this.value = input === null ? null : Board.parse(input)
    this.items = new Map(this.value?.items.map((item) => [item.id, item]) ?? [])
    const addresses = new Set(this.value?.items.map((item) => item.address) ?? [])
    for (const address of this.cache.keys()) if (!addresses.has(address)) this.cache.delete(address)
    this.shapes = { items: {}, labels: {} }
    for (const item of this.value?.items ?? [])
      this.shapes.items[item.id] = this.cache.get(item.address)?.value
        ? resolvedShape(this.cache.get(item.address)?.value as ResolvedBoardItem)
        : provisionalShape(item.kind)
    for (const label of this.value?.labels ?? []) this.shapes.labels[label.id] = { width: Math.max(1, label.text.length * 8), height: 19 }
    if (this.value) this.dir = this.value.direction
    this.names.update(this.value?.items ?? [], this.nameProvider)
    this.reconcileMounted(previous, this.value)
    this.render()
    this.fitInitial()
    this.dispatchEvent(new CustomEvent('segnavia-board-change', { detail: { board: this.value }, bubbles: true, composed: true }))
  }

  get view(): BoardView {
    return this.currentView
  }

  set view(value: BoardView) {
    this.viewWasSet = true
    this.setView(value)
  }

  get liveWidth(): number {
    return this.threshold
  }

  set liveWidth(value: number) {
    this.threshold = value
    this.render()
  }

  get resolveItem(): ResolveBoardItem | undefined {
    return this.resolver
  }

  set resolveItem(value: ResolveBoardItem | undefined) {
    this.resolver = value
    this.render()
  }

  get itemNames(): BoardItemNames | undefined {
    return this.nameProvider
  }

  set itemNames(value: BoardItemNames | undefined) {
    this.nameProvider = value
    this.names.update(this.value?.items ?? [], value)
  }

  itemName(id: string): string {
    const item = this.items.get(id)
    const entry = item ? this.cache.get(item.address) : undefined
    return this.names.name(item, entry?.failed ? undefined : entry?.value)
  }

  connectedCallback() {
    ensureBaseStyle(this.surface)
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0
    this.addEventListener('wheel', this.gestures.onWheel, { passive: false })
    this.addEventListener('pointerdown', this.gestures.onPointerDown)
    this.addEventListener('pointermove', this.gestures.onPointerMove)
    this.addEventListener('pointerup', this.gestures.onPointerEnd)
    this.addEventListener('pointercancel', this.gestures.onPointerEnd)
    this.addEventListener('keydown', this.onKeyDown)
    this.addEventListener('dblclick', this.onDoubleClick)
    this.resize.observe(this)
    this.measure()
    this.render()
  }

  disconnectedCallback() {
    this.resize.disconnect()
    this.removeEventListener('wheel', this.gestures.onWheel)
    this.removeEventListener('pointerdown', this.gestures.onPointerDown)
    this.removeEventListener('pointermove', this.gestures.onPointerMove)
    this.removeEventListener('pointerup', this.gestures.onPointerEnd)
    this.removeEventListener('pointercancel', this.gestures.onPointerEnd)
    this.removeEventListener('keydown', this.onKeyDown)
    this.removeEventListener('dblclick', this.onDoubleClick)
    this.clearMounted()
  }

  fitAll() {
    const board = this.value
    if (!board || this.clientWidth <= 96 || this.clientHeight <= 96) return
    const bounds = boardBounds(board, this.shapes)
    if (!(bounds.width > 0 && bounds.height > 0)) return
    this.setView(zoomToFit(bounds, { width: this.clientWidth, height: this.clientHeight }, 48))
  }

  reveal(id: string): boolean {
    const board = this.value
    if (!board || this.clientWidth <= 96 || this.clientHeight <= 96) return false
    const item = board.items.find((entry) => entry.id === id)
    const section = board.sections.find((entry) => entry.id === id)
    if (!item && !section) return false
    const bounds = section?.rectangle ?? {
      x: item?.x ?? 0,
      y: item?.y ?? 0,
      width: item?.width ?? 0,
      height: item ? itemHeight(item, this.shapes.items[item.id] as { width: number; height: number }) : 0,
    }
    this.setView(revealView(bounds, { width: this.clientWidth, height: this.clientHeight }, 48))
    if (item) requestAnimationFrame(() => this.nodes.get(item.id)?.focus())
    return true
  }

  private fitInitial() {
    if (this.initialFitDone || this.viewWasSet || !this.value) return
    if (this.clientWidth <= 96 || this.clientHeight <= 96) return
    this.initialFitDone = true
    this.fitAll()
  }

  private measure() {
    const viewport = { width: this.clientWidth, height: this.clientHeight }
    if (viewport.width === this.currentView.viewport.width && viewport.height === this.currentView.viewport.height) return
    this.setView({ ...this.currentView, viewport })
    this.fitInitial()
  }

  private setView(value: BoardView) {
    this.currentView = { ...value, pan: { ...value.pan }, viewport: { ...value.viewport } }
    this.render()
    if (this.viewEvent) return
    this.viewEvent = requestAnimationFrame(() => {
      this.viewEvent = 0
      this.dispatchEvent(new CustomEvent('segnavia-board-view', { detail: { view: this.currentView }, bubbles: true, composed: true }))
    })
  }

  private render() {
    const board = this.value
    if (!board) {
      this.clearMounted()
      this.decorations.clear()
      this.surface.replaceChildren()
      return
    }
    this.decorations.render(board, this.currentView)
    const half = new Set(
      visibleItems(board, this.shapes, this.currentView, Math.max(this.currentView.viewport.width, this.currentView.viewport.height) / 2).map(
        (item) => item.id,
      ),
    )
    const full = new Set(
      visibleItems(board, this.shapes, this.currentView, Math.max(this.currentView.viewport.width, this.currentView.viewport.height)).map((item) => item.id),
    )
    for (const item of board.items) {
      const mounted = this.nodes.has(item.id)
      if (!shouldMountItem(mounted, half.has(item.id), full.has(item.id))) {
        if (mounted) this.unmount(item.id)
        continue
      }
      const node = this.nodes.get(item.id) ?? this.mount(item)
      this.placeItem(node, item)
      this.paintItem(node, item)
      this.resolve(item)
    }
  }

  private mount(item: BoardItem): HTMLElement {
    const node = document.createElement('div')
    node.part.add('item')
    node.dataset.boardItem = item.id
    node.tabIndex = 0
    node.setAttribute('role', 'button')
    this.nodes.set(item.id, node)
    this.surface.append(node)
    this.titles.mount(item.id, node)
    return node
  }

  private placeItem(node: HTMLElement, item: BoardItem) {
    placeBoardNode(node, this.currentView, {
      x: item.x,
      y: item.y,
      width: item.width,
      height: itemHeight(item, this.shapes.items[item.id] as { width: number; height: number }),
    })
    this.titles.place(item.id, this.currentView, item)
  }

  private paintItem(node: HTMLElement, item: BoardItem) {
    const entry = this.cache.get(item.address)
    const resolved = entry?.failed ? undefined : entry?.value
    const name = this.names.name(item, resolved)
    node.setAttribute('aria-label', name || item.kind)
    this.titles.name(item.id, name)
    const tier = boardTier(item.width * this.currentView.zoom, this.threshold)
    if (this.tiers.get(item.id) === tier && this.painted.get(item.id) === resolved && node.childElementCount > 0) return
    this.disposeLive(item.id)
    node.replaceChildren()
    this.tiers.set(item.id, tier)
    this.painted.set(item.id, resolved)
    let content: HTMLElement
    try {
      content = resolved ? this.contentFor(item, resolved, tier) : this.placeholder()
    } catch (error) {
      this.fail(item, error)
      return
    }
    node.append(content, this.shield())
  }

  private contentFor(item: BoardItem, resolved: ResolvedBoardItem, tier: 'cover' | 'live'): HTMLElement {
    if (resolved.kind === 'image' || resolved.kind === 'shot') return this.image(resolved.src, 'cover')
    if (tier === 'cover') return resolved.cover ? this.image(resolved.cover, 'cover') : this.placeholder()
    const live = liveBoardItem(resolved, (error) => this.fail(item, error))
    this.disposals.set(item.id, live.dispose)
    return live.element
  }

  private image(src: string, part: string): HTMLImageElement {
    const image = document.createElement('img')
    image.src = src
    image.alt = ''
    image.part.add(part)
    return image
  }

  private placeholder(): HTMLElement {
    const placeholder = document.createElement('div')
    placeholder.part.add('placeholder')
    return placeholder
  }

  private shield(): HTMLElement {
    const shield = document.createElement('div')
    shield.className = 'shield'
    return shield
  }

  private resolve(item: BoardItem) {
    if (!this.resolver || this.cache.has(item.address)) return
    const entry: CacheEntry = {}
    this.cache.set(item.address, entry)
    entry.promise = Promise.resolve()
      .then(() => this.resolver?.(item) as Promise<ResolvedBoardItem>)
      .then((resolved) => {
        checkResolved(item, resolved)
        entry.value = resolved
        for (const current of this.value?.items ?? []) if (current.address === item.address) this.shapes.items[current.id] = resolvedShape(resolved)
        this.render()
      })
      .catch((error) => this.fail(item, error))
  }

  private fail(item: BoardItem, error: unknown) {
    const entry = this.cache.get(item.address)
    if (!entry || entry.failed) return
    entry.failed = true
    entry.error = error
    for (const current of this.value?.items ?? []) if (current.address === item.address) this.disposeLive(current.id)
    this.dispatchEvent(new CustomEvent('segnavia-board-error', { detail: { item, error }, bubbles: true, composed: true }))
    this.render()
  }

  private unmount(id: string) {
    this.nodes.get(id)?.remove()
    this.nodes.delete(id)
    this.titles.remove(id)
    this.tiers.delete(id)
    this.painted.delete(id)
    this.disposeLive(id)
  }

  private disposeLive(id: string) {
    this.disposals.get(id)?.()
    this.disposals.delete(id)
  }

  private clearMounted() {
    for (const id of this.nodes.keys()) this.unmount(id)
  }

  private reconcileMounted(previous: Board | null, current: Board | null) {
    const before = new Map(previous?.items.map((item) => [item.id, item]) ?? [])
    const after = new Map(current?.items.map((item) => [item.id, item]) ?? [])
    for (const id of this.nodes.keys()) {
      const oldItem = before.get(id)
      const newItem = after.get(id)
      if (!oldItem || !newItem || oldItem.address !== newItem.address || oldItem.kind !== newItem.kind) this.unmount(id)
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    const itemNode = event.composedPath().find((target): target is HTMLElement => target instanceof HTMLElement && Boolean(target.dataset.boardItem))
    if (event.key === 'Enter' && itemNode) {
      const item = this.value?.items.find((entry) => entry.id === itemNode.dataset.boardItem)
      if (item) this.open(item)
      event.preventDefault()
      return
    }
    if (event.target !== this) return
    const action = keyToView(this.currentView, event.key)
    if (!action) return
    event.preventDefault()
    if (action.kind === 'fit') this.fitAll()
    else this.setView(action.view)
  }

  private onDoubleClick = (event: MouseEvent) => {
    if (this.gestures.dragged || !this.value) return
    const item = itemAt(this.value, this.shapes, screenToBoard(this.currentView, this.gestures.local(event)))
    if (item) this.open(item)
  }

  private open(item: BoardItem) {
    this.dispatchEvent(new CustomEvent('segnavia-board-open', { detail: { item }, bubbles: true, composed: true }))
  }
}

export type { BoardItemNames } from './board-names.ts'
export type { ResolvedBoardItem } from './board-policy.ts'
