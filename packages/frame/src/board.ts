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
import type { BoardItemAction, BoardItemKind } from './board-actions.ts'
import { BoardChrome } from './board-chrome.ts'
import { BoardDecorations } from './board-decorations.ts'
import { BoardGestures } from './board-gestures.ts'
import { BoardInput } from './board-input.ts'
import { type BoardItemNames, BoardNames } from './board-names.ts'
import { BoardPainter } from './board-painter.ts'
import { placeBoardNode } from './board-placement.ts'
import * as boardPolicy from './board-policy.ts'
import { BoardResolutions, type ResolveBoardItem } from './board-resolutions.ts'
import { BoardSelection } from './board-selection.ts'
import { BoardItemTitles } from './board-titles.ts'
import type { BoardLabels } from './labels.ts'

export class SegnaviaBoard extends HTMLElement {
  private value: Board | null = null
  private currentView: BoardView = { zoom: 1, pan: { x: 0, y: 0 }, viewport: { width: 0, height: 0 } }
  private viewWasSet = false
  private initialFitDone = false
  private threshold = 240
  private nameProvider: BoardItemNames | undefined
  private shapes: BoardShapes = { items: {}, labels: {} }
  private items = new Map<string, BoardItem>()
  private readonly resolutions = new BoardResolutions()
  private readonly nodes = new Map<string, HTMLElement>()
  private readonly painter = new BoardPainter()
  private viewEvent = 0
  private pendingReveal: { id: string; height: number } | undefined
  private readonly root = this.attachShadow({ mode: 'open' })
  private readonly surface = document.createElement('div')
  private readonly decorations = new BoardDecorations(this.surface)
  private readonly titles = new BoardItemTitles()
  private readonly chrome = new BoardChrome(
    this.titles,
    () => this.value?.items ?? [],
    (id) => this.nodes.has(id),
    (id) => this.itemName(id),
    () => this.value?.direction ?? 'ltr',
  )
  private readonly selection = new BoardSelection(
    this,
    () => this.items,
    () => this.nodes,
  )
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
  private readonly input = new BoardInput(this, this.gestures, {
    item: (id) => (id ? this.items.get(id) : undefined),
    itemAt: (event) => (this.value ? itemAt(this.value, this.shapes, screenToBoard(this.currentView, this.gestures.local(event))) : undefined),
    select: (id) => {
      this.selection.selected = id
    },
    open: (item) => this.open(item),
    boardKey: (event) => this.onBoardKey(event),
    action: (action, item) => this.dispatchEvent(new CustomEvent('segnavia-board-item-action', { detail: { action, item }, bubbles: true, composed: true })),
  })
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
    this.selection.reconcile()
    if (this.pendingReveal && !this.items.has(this.pendingReveal.id)) this.pendingReveal = undefined
    const addresses = new Set(this.value?.items.map((item) => item.address) ?? [])
    this.resolutions.keep(addresses)
    this.shapes = { items: {}, labels: {} }
    for (const item of this.value?.items ?? []) {
      const resolved = this.resolutions.value(item.address)
      this.shapes.items[item.id] = resolved ? boardPolicy.resolvedShape(resolved) : boardPolicy.provisionalShape(item.kind)
    }
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

  get kindIcon(): ((kind: BoardItemKind) => Node | null | undefined) | undefined {
    return this.chrome.kindIcon
  }

  set kindIcon(value: ((kind: BoardItemKind) => Node | null | undefined) | undefined) {
    this.chrome.kindIcon = value
    this.chrome.refresh()
    this.dispatchEvent(new CustomEvent('segnavia-board-icons', { bubbles: true, composed: true }))
  }

  get selected(): string | null {
    return this.selection.selected
  }

  set selected(value: string | null) {
    this.selection.selected = value
  }

  get itemActions(): readonly BoardItemAction[] {
    return this.chrome.itemActions
  }

  set itemActions(value: readonly BoardItemAction[]) {
    this.chrome.itemActions = value
    this.chrome.refresh()
  }

  get labels(): Partial<BoardLabels> {
    return this.chrome.labels
  }

  set labels(value: Partial<BoardLabels>) {
    this.chrome.labels = value
    this.chrome.refresh()
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
    return this.resolutions.resolver
  }

  set resolveItem(value: ResolveBoardItem | undefined) {
    this.resolutions.resolver = value
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
    return this.names.name(item, item ? this.resolutions.value(item.address) : undefined)
  }

  connectedCallback() {
    ensureBaseStyle(this.surface)
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0
    this.input.connect()
    this.resize.observe(this)
    this.measure()
    this.render()
  }

  disconnectedCallback() {
    this.resize.disconnect()
    this.input.disconnect()
    this.clearMounted()
  }

  fitAll() {
    this.pendingReveal = undefined
    const board = this.value
    if (!board || this.clientWidth <= 96 || this.clientHeight <= 96) return
    const bounds = boardBounds(board, this.shapes)
    if (!(bounds.width > 0 && bounds.height > 0)) return
    this.setView(zoomToFit(bounds, { width: this.clientWidth, height: this.clientHeight }, 48))
  }

  zoomIn() {
    this.zoomTo(this.currentView.zoom * boardPolicy.BOARD_ZOOM_FACTOR)
  }

  zoomOut() {
    this.zoomTo(this.currentView.zoom / boardPolicy.BOARD_ZOOM_FACTOR)
  }

  zoomTo(zoom: number) {
    if (!this.value || this.currentView.viewport.width <= 0 || this.currentView.viewport.height <= 0) return
    this.setView(boardPolicy.zoomView(this.currentView, zoom))
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
    this.pendingReveal = undefined
    this.setView(revealView(bounds, { width: this.clientWidth, height: this.clientHeight }, 48))
    if (item) this.pendingReveal = { id: item.id, height: bounds.height }
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
    this.pendingReveal = undefined
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
      if (!boardPolicy.shouldMountItem(mounted, half.has(item.id), full.has(item.id))) {
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
    this.selection.mount(node, item.id)
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
    const resolved = this.resolutions.value(item.address)
    const name = this.names.name(item, resolved)
    node.setAttribute('aria-label', name || item.kind)
    this.chrome.render(item)
    const tier = boardPolicy.boardTier(item.width * this.currentView.zoom, this.threshold)
    this.painter.paint(node, item, resolved, tier, (error) => this.fail(item, error))
  }

  private resolve(item: BoardItem) {
    this.resolutions.request(
      item,
      (resolvedItem, resolved) => {
        const shape = boardPolicy.resolvedShape(resolved)
        const pendingItem = this.pendingReveal ? this.items.get(this.pendingReveal.id) : undefined
        const resolvedId = pendingItem?.address === resolvedItem.address ? pendingItem.id : undefined
        const refit = boardPolicy.shouldRefitReveal(
          this.pendingReveal?.id,
          resolvedId,
          this.pendingReveal?.height ?? 0,
          pendingItem ? itemHeight(pendingItem, shape) : 0,
        )
        for (const current of this.value?.items ?? []) if (current.address === resolvedItem.address) this.shapes.items[current.id] = shape
        if (refit && resolvedId) this.reveal(resolvedId)
        else this.render()
        if (resolved.title) this.dispatchEvent(new CustomEvent('segnavia-board-names', { bubbles: true, composed: true }))
      },
      (failedItem, error) => this.fail(failedItem, error),
    )
  }

  private fail(item: BoardItem, error: unknown) {
    if (!this.resolutions.fail(item)) return
    for (const current of this.value?.items ?? []) if (current.address === item.address) this.painter.dispose(current.id)
    this.dispatchEvent(new CustomEvent('segnavia-board-error', { detail: { item, error }, bubbles: true, composed: true }))
    this.render()
  }

  private unmount(id: string) {
    this.nodes.get(id)?.remove()
    this.nodes.delete(id)
    this.titles.remove(id)
    this.painter.remove(id)
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

  private onBoardKey(event: KeyboardEvent) {
    const action = boardPolicy.keyToView(this.currentView, event.key)
    if (!action) return
    event.preventDefault()
    if (action.kind === 'fit') this.fitAll()
    else this.setView(action.view)
  }

  private open(item: BoardItem) {
    this.dispatchEvent(new CustomEvent('segnavia-board-open', { detail: { item }, bubbles: true, composed: true }))
  }
}

export type { BoardItemNames } from './board-names.ts'
