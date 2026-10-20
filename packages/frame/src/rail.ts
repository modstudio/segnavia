import { SegnaviaControl } from './control.ts'
import type { DeckState } from './controller.ts'
import { COMPACT_PLAYER_WIDTH } from './player-layout.ts'
import { railMoveTarget, railSelection } from './rail-navigation.ts'
import { thumbnailCanvas, thumbnailScale } from './thumbnail-canvas.ts'

const RAIL_CSS = `
:host{display:block;min-block-size:0;--_size:var(--segnavia-rail-size,160px);color:var(--segnavia-ink,CanvasText)}
ol{box-sizing:border-box;display:flex;flex-direction:column;gap:10px;block-size:100%;overflow:auto;list-style:none;margin:0;padding:12px}
li{flex:none;position:relative}
button{all:unset;box-sizing:border-box;display:block;inline-size:var(--_size);cursor:pointer;border-radius:var(--segnavia-radius,10px);position:relative}
button:focus-visible{outline:2px solid var(--segnavia-accent,#356ae6);outline-offset:2px}
.preview{position:relative;display:block;overflow:hidden;inline-size:100%;aspect-ratio:16/9;border:1px solid var(--segnavia-line,color-mix(in srgb,CanvasText 18%,transparent));border-radius:inherit;background:var(--segnavia-surface,Canvas)}
[aria-selected="true"] .preview{border:2px solid var(--segnavia-accent,#356ae6)}
button[data-insert="before"]::before,button[data-insert="after"]::after{content:"";position:absolute;z-index:3;inset-inline:0;block-size:3px;background:var(--segnavia-accent,#356ae6);border-radius:2px}
button[data-insert="before"]::before{inset-block-start:-6px}button[data-insert="after"]::after{inset-block-end:-6px}
.number{position:absolute;inset-inline-start:6px;inset-block-end:5px;min-inline-size:1.5em;padding:1px 4px;border-radius:4px;background:color-mix(in srgb,Canvas 84%,transparent);color:CanvasText;font:600 11px/1.4 system-ui;text-align:center}
.segnavia-stage__canvas{position:absolute;inset-inline-start:50%;inset-block-start:50%;transform-origin:center;background:var(--_segnavia-shot-backdrop,var(--segnavia-shot-backdrop,transparent));pointer-events:none}
.segnavia-stage__canvas>iframe{position:absolute;inset:0;inline-size:100%;block-size:100%;border:0;margin:0}
.segnavia-stage__annotations{pointer-events:none;color:var(--segnavia-annotation-color,#e5484d)}
[data-annotation]{opacity:1}
@container (max-width:${COMPACT_PLAYER_WIDTH}px){ol{flex-direction:row;block-size:auto;inline-size:100%;padding:8px 12px}
button[data-insert="before"]::before,button[data-insert="after"]::after{inset-block:0;inline-size:3px;block-size:auto}
button[data-insert="before"]::before{inset-inline-start:-6px;inset-inline-end:auto}button[data-insert="after"]::after{inset-inline-end:-6px;inset-inline-start:auto}}
`

export interface RailReorderIntent {
  fromIndex: number
  toIndex: number
}

export class SegnaviaRail extends SegnaviaControl {
  mountMargin = 400
  private observer: IntersectionObserver | null = null
  private resize = new ResizeObserver(() => this.measure())
  private selected = 0
  private active = -1
  private reorderEnabled = false
  private dragFrom: number | null = null
  private reorderListeners = new Set<(intent: RailReorderIntent) => void>()

  protected styles() {
    return RAIL_CSS
  }

  protected markup() {
    return '<ol part="rail"></ol>'
  }

  connectedCallback() {
    super.connectedCallback()
    this.setAttribute('role', 'listbox')
    this.root.addEventListener('keydown', this.onKey as EventListener)
    this.root.addEventListener('dragstart', this.onDragStart as EventListener)
    this.root.addEventListener('dragover', this.onDragOver as EventListener)
    this.root.addEventListener('drop', this.onDrop as EventListener)
    this.root.addEventListener('dragend', this.clearDrag)
    this.resize.observe(this)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.observer?.disconnect()
    this.resize.disconnect()
  }

  protected render(state: DeckState) {
    const deck = state.deck
    if (!deck) return
    const root = this.getRootNode()
    if (root instanceof ShadowRoot && root.host.tagName === 'SEGNAVIA-PLAYER' && !root.host.hasAttribute('rail')) {
      this.observer?.disconnect()
      this.root.querySelector('ol')?.replaceChildren()
      return
    }
    this.dir = state.direction
    this.setAttribute('aria-label', this.labels.rail)
    this.reconcile(state)
    if (this.active !== state.index) {
      this.active = state.index
      this.selected = state.index
    }
    this.syncSelection(state)
    this.observe(state)
  }

  refresh() {
    if (this.controller?.state.deck) this.render(this.controller.state)
  }

  setReorderEnabled(enabled: boolean) {
    this.reorderEnabled = enabled
    for (const button of this.itemElements()) button.draggable = enabled
    if (!enabled) this.clearDrag()
  }

  subscribeReorder(listener: (intent: RailReorderIntent) => void): () => void {
    this.reorderListeners.add(listener)
    return () => this.reorderListeners.delete(listener)
  }

  itemElements(): HTMLButtonElement[] {
    return [...this.root.querySelectorAll<HTMLButtonElement>('button[data-index]')]
  }

  clearItems() {
    this.root.querySelector('ol')?.replaceChildren()
  }

  protected clicked(event: Event) {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]')
    if (!button) return
    this.selected = Number(button.dataset.index)
    if (this.controller) this.syncSelection(this.controller.state)
    void this.controller?.go(this.selected).catch(() => {})
  }

  private reconcile(state: DeckState) {
    const list = this.root.querySelector('ol') as HTMLOListElement
    const existing = new Map([...list.children].map((item) => [(item as HTMLElement).dataset.slideId, item as HTMLLIElement]))
    const wanted = new Set(state.deck?.slides.map((slide) => slide.id))
    for (const [id, item] of existing) if (!id || !wanted.has(id)) item.remove()
    state.deck?.slides.forEach((slide, index) => {
      let item = existing.get(slide.id)
      if (!item) {
        item = document.createElement('li')
        item.dataset.slideId = slide.id
        item.innerHTML = '<button role="option"><span class="preview"></span><span class="number" part="thumbnail-number"></span></button>'
      }
      const button = item.querySelector('button') as HTMLButtonElement
      button.dataset.index = String(index)
      button.draggable = this.reorderEnabled
      button.setAttribute('aria-label', this.labels.slide(index + 1, state.deck?.slides.length ?? 0))
      ;(button.querySelector('.number') as HTMLElement).textContent = String(index + 1)
      list.append(item)
    })
  }

  private syncSelection(state: DeckState) {
    const buttons = this.root.querySelectorAll<HTMLButtonElement>('button[data-index]')
    for (const button of buttons) {
      const index = Number(button.dataset.index)
      const current = index === state.index
      button.tabIndex = index === this.selected ? 0 : -1
      button.setAttribute('aria-selected', String(current))
      button.setAttribute('part', current ? 'thumbnail thumbnail-current' : 'thumbnail')
    }
    const current = buttons[state.index]
    current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  private observe(state: DeckState) {
    this.observer?.disconnect()
    const list = this.root.querySelector('ol') as HTMLOListElement
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.index)
          if (entry.isIntersecting) this.mount(index, state)
          else this.unmount(index, state)
        }
      },
      { root: list, rootMargin: `${this.mountMargin}px` },
    )
    for (const button of list.querySelectorAll<HTMLButtonElement>('button[data-index]')) this.observer.observe(button)
    this.mount(state.index, state)
  }

  private mount(index: number, state: DeckState) {
    const controller = this.controller
    const deck = state.deck
    const slide = deck?.slides[index]
    const preview = this.root.querySelector<HTMLElement>(`button[data-index="${index}"] .preview`)
    if (!controller || !deck || !slide || !preview || preview.childElementCount) return
    const generation = Number(preview.dataset.generation ?? '0')
    void controller
      .contentFor(index)
      .then((content) => {
        if (!preview.isConnected || controller.state.deck?.slides[index]?.id !== slide.id) return
        if (Number(preview.dataset.generation ?? '0') !== generation) return
        const canvas = thumbnailCanvas(controller, deck, slide, index, content)
        preview.append(canvas)
        this.measure()
      })
      .catch(() => {})
  }

  private unmount(index: number, state: DeckState) {
    if (index === state.index) return
    const preview = this.root.querySelector<HTMLElement>(`button[data-index="${index}"] .preview`)
    if (!preview) return
    preview.dataset.generation = String(Number(preview.dataset.generation ?? '0') + 1)
    if (preview.childElementCount) preview.replaceChildren()
  }

  private measure() {
    const deck = this.controller?.state.deck
    if (!deck) return
    for (const preview of this.root.querySelectorAll<HTMLElement>('.preview')) {
      const canvas = preview.firstElementChild as HTMLElement | null
      if (canvas) canvas.style.transform = `scale(${thumbnailScale(preview.clientWidth, deck.size.width)})`
    }
  }

  private onKey = (event: KeyboardEvent) => {
    if (!this.controller?.state.deck) return
    const list = this.root.querySelector('ol') as HTMLOListElement
    const horizontal = getComputedStyle(list).flexDirection === 'row'
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && this.reorderEnabled) {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]')
      if (!button) return
      const fromIndex = Number(button.dataset.index)
      const toIndex = railSelection(fromIndex, event.key, this.controller.state.deck.slides.length, horizontal, this.controller.state.direction)
      if (toIndex === fromIndex) return
      event.preventDefault()
      this.emitReorder(fromIndex, toIndex)
      return
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const next = railSelection(this.selected, event.key, this.controller.state.deck.slides.length, horizontal, this.controller.state.direction)
    if (next === this.selected) return
    event.preventDefault()
    this.selected = next
    this.syncSelection(this.controller.state)
    this.root.querySelector<HTMLButtonElement>(`button[data-index="${next}"]`)?.focus()
  }

  private onDragStart = (event: DragEvent) => {
    if (!this.reorderEnabled) return event.preventDefault()
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]')
    if (!button) return
    this.dragFrom = Number(button.dataset.index)
    event.dataTransfer?.setData('text/plain', button.dataset.index ?? '')
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  private onDragOver = (event: DragEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]')
    if (this.dragFrom === null || !button || !this.controller) return
    event.preventDefault()
    const list = this.root.querySelector('ol') as HTMLOListElement
    const horizontal = getComputedStyle(list).flexDirection === 'row'
    const rect = button.getBoundingClientRect()
    const after = horizontal
      ? this.controller.state.direction === 'rtl'
        ? event.clientX < rect.left + rect.width / 2
        : event.clientX >= rect.left + rect.width / 2
      : event.clientY >= rect.top + rect.height / 2
    for (const item of this.itemElements()) item.removeAttribute('data-insert')
    button.dataset.insert = after ? 'after' : 'before'
  }

  private onDrop = (event: DragEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]')
    const count = this.controller?.state.deck?.slides.length ?? 0
    if (this.dragFrom === null || !button || !count) return
    event.preventDefault()
    const fromIndex = this.dragFrom
    const toIndex = railMoveTarget(fromIndex, Number(button.dataset.index), button.dataset.insert === 'after', count)
    this.clearDrag()
    this.emitReorder(fromIndex, toIndex)
  }

  private clearDrag = () => {
    this.dragFrom = null
    for (const button of this.itemElements()) button.removeAttribute('data-insert')
  }

  private emitReorder(fromIndex: number, toIndex: number) {
    for (const listener of this.reorderListeners) listener({ fromIndex, toIndex })
  }
}
