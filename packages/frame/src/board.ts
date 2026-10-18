import {
  Board,
  type BoardItem,
  type BoardShapes,
  type BoardView,
  boardBounds,
  boardToScreen,
  itemAt,
  itemHeight,
  resolveDirection,
  screenToBoard,
  visibleItems,
  zoomAt,
  zoomToFit,
} from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { liveBoardItem } from './board-live.ts'
import { boardTier, keyToView, provisionalShape, type ResolvedBoardItem, resolvedShape, shouldMountItem } from './board-policy.ts'

interface CacheEntry {
  promise?: Promise<void>
  value?: ResolvedBoardItem
  error?: unknown
}

interface PointerPosition {
  x: number
  y: number
}

export type ResolveBoardItem = (item: BoardItem) => Promise<ResolvedBoardItem>
export class SegnaviaBoard extends HTMLElement {
  private value: Board | null = null
  private currentView: BoardView = { zoom: 1, pan: { x: 0, y: 0 }, viewport: { width: 0, height: 0 } }
  private viewWasSet = false
  private initialFitDone = false
  private threshold = 240
  private resolver: ResolveBoardItem | undefined
  private shapes: BoardShapes = { items: {}, labels: {} }
  private readonly cache = new Map<string, CacheEntry>()
  private readonly nodes = new Map<string, HTMLElement>()
  private readonly tiers = new Map<string, 'cover' | 'live'>()
  private readonly painted = new Map<string, ResolvedBoardItem | undefined>()
  private readonly disposals = new Map<string, () => void>()
  private readonly pointers = new Map<number, PointerPosition>()
  private pointerStart: PointerPosition | null = null
  private lastPinch: { midpoint: PointerPosition; distance: number } | null = null
  private dragged = false
  private viewEvent = 0
  private readonly root = this.attachShadow({ mode: 'open' })
  private readonly surface = document.createElement('div')
  private readonly resize = new ResizeObserver(() => this.measure())

  constructor() {
    super()
    this.surface.part.add('surface')
    this.root.append(this.surface)
  }

  get board(): Board | null {
    return this.value
  }

  set board(input: Board | null) {
    this.value = input === null ? null : Board.parse(input)
    const addresses = new Set(this.value?.items.map((item) => item.address) ?? [])
    for (const address of this.cache.keys()) if (!addresses.has(address)) this.cache.delete(address)
    this.shapes = { items: {}, labels: {} }
    for (const item of this.value?.items ?? [])
      this.shapes.items[item.id] = this.cache.get(item.address)?.value
        ? resolvedShape(this.cache.get(item.address)?.value as ResolvedBoardItem)
        : provisionalShape(item.kind)
    for (const label of this.value?.labels ?? []) this.shapes.labels[label.id] = { width: Math.max(1, label.text.length * 8), height: 19 }
    if (this.value) this.dir = this.value.direction
    this.clearMounted()
    this.render()
    this.fitInitial()
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

  connectedCallback() {
    ensureBaseStyle(this.surface)
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0
    this.addEventListener('wheel', this.onWheel, { passive: false })
    this.addEventListener('pointerdown', this.onPointerDown)
    this.addEventListener('pointermove', this.onPointerMove)
    this.addEventListener('pointerup', this.onPointerEnd)
    this.addEventListener('pointercancel', this.onPointerEnd)
    this.addEventListener('keydown', this.onKeyDown)
    this.addEventListener('dblclick', this.onDoubleClick)
    this.resize.observe(this)
    this.measure()
  }

  disconnectedCallback() {
    this.resize.disconnect()
    this.removeEventListener('wheel', this.onWheel)
    this.removeEventListener('pointerdown', this.onPointerDown)
    this.removeEventListener('pointermove', this.onPointerMove)
    this.removeEventListener('pointerup', this.onPointerEnd)
    this.removeEventListener('pointercancel', this.onPointerEnd)
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
      this.surface.replaceChildren()
      return
    }
    this.renderDecorations(board)
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
      this.surface.append(node)
      this.resolve(item)
    }
  }

  private renderDecorations(board: Board) {
    for (const node of this.surface.querySelectorAll('[data-decoration]')) node.remove()
    for (const section of board.sections) {
      const node = document.createElement('div')
      node.dataset.decoration = ''
      node.part.add('section')
      this.place(node, section.rectangle.x, section.rectangle.y, section.rectangle.width, section.rectangle.height)
      const title = document.createElement('div')
      title.part.add('section-title')
      title.textContent = section.title
      title.dir = resolveDirection(undefined, undefined, section.title)
      node.append(title)
      this.surface.prepend(node)
    }
    for (const label of board.labels) {
      const node = document.createElement('div')
      node.dataset.decoration = ''
      node.part.add('label')
      node.textContent = label.text
      node.dir = resolveDirection(undefined, undefined, label.text)
      const point = boardToScreen(this.currentView, label)
      node.style.insetInlineStart = `${point.x}px`
      node.style.insetBlockStart = `${point.y}px`
      node.style.fontSize = `${16 * this.currentView.zoom}px`
      this.surface.prepend(node)
    }
  }

  private mount(item: BoardItem): HTMLElement {
    const node = document.createElement('div')
    node.part.add('item')
    node.dataset.boardItem = item.id
    node.tabIndex = 0
    node.setAttribute('role', 'button')
    this.nodes.set(item.id, node)
    return node
  }

  private placeItem(node: HTMLElement, item: BoardItem) {
    this.place(node, item.x, item.y, item.width, itemHeight(item, this.shapes.items[item.id] as { width: number; height: number }))
  }

  private place(node: HTMLElement, x: number, y: number, width: number, height: number) {
    const point = boardToScreen(this.currentView, { x, y })
    node.style.insetInlineStart = `${point.x}px`
    node.style.insetBlockStart = `${point.y}px`
    node.style.inlineSize = `${width * this.currentView.zoom}px`
    node.style.blockSize = `${height * this.currentView.zoom}px`
  }

  private paintItem(node: HTMLElement, item: BoardItem) {
    const resolved = this.cache.get(item.address)?.value
    node.setAttribute('aria-label', resolved?.title ?? item.kind)
    const tier = boardTier(item.width * this.currentView.zoom, this.threshold)
    if (this.tiers.get(item.id) === tier && this.painted.get(item.id) === resolved && node.childElementCount > 0) return
    this.disposeLive(item.id)
    node.replaceChildren()
    this.tiers.set(item.id, tier)
    this.painted.set(item.id, resolved)
    const content = resolved ? this.contentFor(item, resolved, tier) : this.placeholder()
    node.append(content, this.shield())
  }

  private contentFor(item: BoardItem, resolved: ResolvedBoardItem, tier: 'cover' | 'live'): HTMLElement {
    if (resolved.kind === 'image' || resolved.kind === 'shot') return this.image(resolved.src, 'cover')
    if (tier === 'cover') return resolved.cover ? this.image(resolved.cover, 'cover') : this.placeholder()
    const live = liveBoardItem(resolved)
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
    entry.promise = Promise.resolve(this.resolver(item)).then(
      (resolved) => {
        entry.value = resolved
        for (const current of this.value?.items ?? []) if (current.address === item.address) this.shapes.items[current.id] = resolvedShape(resolved)
        this.render()
      },
      (error) => {
        entry.error = error
        this.dispatchEvent(new CustomEvent('segnavia-board-error', { detail: { item, error }, bubbles: true, composed: true }))
        this.render()
      },
    )
  }

  private unmount(id: string) {
    this.nodes.get(id)?.remove()
    this.nodes.delete(id)
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

  private local(event: { clientX: number; clientY: number }): PointerPosition {
    const box = this.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) this.setView(zoomAt(this.currentView, this.local(event), Math.exp(-event.deltaY * 0.01)))
    else this.setView({ ...this.currentView, pan: { x: this.currentView.pan.x - event.deltaX, y: this.currentView.pan.y - event.deltaY } })
  }

  private onPointerDown = (event: PointerEvent) => {
    this.setPointerCapture(event.pointerId)
    const point = this.local(event)
    this.pointers.set(event.pointerId, point)
    if (this.pointers.size === 1) this.pointerStart = point
    this.lastPinch = this.pinch()
    this.dragged = false
  }

  private onPointerMove = (event: PointerEvent) => {
    const previous = this.pointers.get(event.pointerId)
    if (!previous) return
    const point = this.local(event)
    this.pointers.set(event.pointerId, point)
    const pinch = this.pinch()
    if (pinch && this.lastPinch) {
      const zoomed = zoomAt(this.currentView, pinch.midpoint, pinch.distance / this.lastPinch.distance)
      this.setView({
        ...zoomed,
        pan: { x: zoomed.pan.x + pinch.midpoint.x - this.lastPinch.midpoint.x, y: zoomed.pan.y + pinch.midpoint.y - this.lastPinch.midpoint.y },
      })
      this.lastPinch = pinch
    } else if (this.pointers.size === 1) {
      this.setView({ ...this.currentView, pan: { x: this.currentView.pan.x + point.x - previous.x, y: this.currentView.pan.y + point.y - previous.y } })
    }
    if (this.pointerStart && Math.hypot(point.x - this.pointerStart.x, point.y - this.pointerStart.y) > 4) this.dragged = true
  }

  private onPointerEnd = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId)
    this.lastPinch = this.pinch()
    if (this.pointers.size === 0) this.pointerStart = null
  }

  private pinch(): { midpoint: PointerPosition; distance: number } | null {
    const [a, b] = [...this.pointers.values()]
    if (!a || !b) return null
    return { midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }
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
    if (this.dragged || !this.value) return
    const item = itemAt(this.value, this.shapes, screenToBoard(this.currentView, this.local(event)))
    if (item) this.open(item)
  }

  private open(item: BoardItem) {
    this.dispatchEvent(new CustomEvent('segnavia-board-open', { detail: { item }, bubbles: true, composed: true }))
  }
}

export type { ResolvedBoardItem } from './board-policy.ts'
