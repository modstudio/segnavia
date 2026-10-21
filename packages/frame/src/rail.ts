import { animationMessage, MESSAGE } from './bridge.ts'
import { SegnaviaControl } from './control.ts'
import type { DeckState } from './controller.ts'
import { COMPACT_PLAYER_WIDTH } from './player-layout.ts'
import { railOverflow, railSelection } from './rail-navigation.ts'
import { RAIL_REORDER_CSS, RailDragReorder } from './rail-reorder.ts'
import { thumbnailCanvas, thumbnailScale } from './thumbnail-canvas.ts'

const RAIL_CSS = `
:host{display:block;min-block-size:0;--_size:var(--segnavia-rail-size,160px);color:var(--segnavia-ink,CanvasText)}
ol{box-sizing:border-box;display:flex;flex-direction:column;gap:10px;block-size:100%;overflow:auto;list-style:none;margin:0;padding:12px}
/* An edge fades where the list hides more, so a thumbnail cut by the edge reads as more to scroll to. */
ol{--_fade-dir:to bottom;--_fade-before:0px;--_fade-after:0px;mask-image:linear-gradient(var(--_fade-dir),transparent,#000 var(--_fade-before),#000 calc(100% - var(--_fade-after)),transparent)}
ol[data-more-before]{--_fade-before:32px}ol[data-more-after]{--_fade-after:32px}
li{flex:none;position:relative}
button{font:inherit}
button[data-index]{all:unset;box-sizing:border-box;display:block;inline-size:var(--_size);cursor:pointer;border-radius:var(--segnavia-radius,10px);position:relative}
button:focus-visible{outline:2px solid var(--segnavia-accent,#356ae6);outline-offset:2px}
.preview{position:relative;display:block;overflow:hidden;inline-size:100%;aspect-ratio:16/9;border:1px solid var(--segnavia-line,color-mix(in srgb,CanvasText 18%,transparent));border-radius:inherit;background:var(--segnavia-surface,Canvas)}
[aria-selected="true"] .preview{border:2px solid var(--segnavia-accent,#356ae6)}
${RAIL_REORDER_CSS}
.number{position:absolute;inset-inline-start:6px;inset-block-end:5px;min-inline-size:1.5em;padding:1px 4px;border-radius:4px;background:color-mix(in srgb,Canvas 84%,transparent);color:CanvasText;font:600 11px/1.4 system-ui;text-align:center}
.slide-menu{position:absolute;z-index:4;inset-block-start:5px;inset-inline-end:5px;border:1px solid color-mix(in srgb,CanvasText 20%,transparent);border-radius:6px;background:Canvas;color:CanvasText;inline-size:30px;block-size:28px;cursor:pointer;opacity:0;pointer-events:none}
li:hover>.slide-menu,li:focus-within>.slide-menu,.slide-menu[aria-expanded="true"]{opacity:1;pointer-events:auto}
.print-mark{position:absolute;z-index:3;inset-inline-end:6px;inset-block-end:5px;padding:2px 4px;border-radius:4px;background:color-mix(in srgb,Canvas 84%,transparent);font:12px/1 system-ui}
.slide-settings-list,.slide-settings-panel{position:fixed;z-index:8;inset:auto;margin:0;box-sizing:border-box;min-inline-size:180px;padding:6px;border:1px solid var(--segnavia-line,color-mix(in srgb,CanvasText 20%,transparent));border-radius:8px;background:var(--segnavia-surface,Canvas);color:var(--segnavia-ink,CanvasText);box-shadow:0 5px 18px color-mix(in srgb,CanvasText 18%,transparent);font:13px/1.4 var(--segnavia-font,system-ui)}
.slide-settings-list button{all:unset;box-sizing:border-box;display:block;inline-size:100%;padding:7px 9px;border-radius:5px;color:inherit;text-align:start;cursor:pointer}
.slide-settings-list button:hover,.slide-settings-list button:focus-visible{background:var(--segnavia-line,color-mix(in srgb,CanvasText 8%,transparent))}
.slide-settings-list button:focus-visible{outline:2px solid var(--segnavia-accent,#356ae6);outline-offset:1px}
.slide-settings-panel{display:grid;gap:10px;inline-size:min(300px,calc(100vw - 24px));padding:12px}
.slide-settings-panel header{display:flex;align-items:start;gap:8px}.slide-settings-panel h2{margin:0;font:600 14px/1.4 inherit}.slide-settings-panel p{margin:2px 0 0;color:var(--segnavia-muted,color-mix(in srgb,CanvasText 65%,transparent));font-size:12px}
.slide-settings-panel output{font-weight:600}.slide-settings-panel input{inline-size:100%}.print-frame-actions{display:flex;justify-content:space-between;gap:8px}
.slide-settings-panel button{all:unset;box-sizing:border-box;padding:6px 10px;border:1px solid var(--segnavia-line,color-mix(in srgb,CanvasText 20%,transparent));border-radius:7px;background:var(--segnavia-surface,Canvas);color:inherit;cursor:pointer}
.slide-settings-panel button:hover{background:var(--segnavia-line,color-mix(in srgb,CanvasText 8%,transparent))}.slide-settings-panel button:focus-visible{outline:2px solid var(--segnavia-accent,#356ae6);outline-offset:1px}
.slide-settings-panel [data-back]{flex:none;padding:4px 7px}.slide-settings-panel [data-done]{border-color:var(--segnavia-accent,#356ae6);background:var(--segnavia-accent,#356ae6);color:var(--segnavia-accent-ink,#fff)}
.segnavia-stage__canvas{position:absolute;inset-inline-start:50%;inset-block-start:50%;transform-origin:center;background:var(--_segnavia-shot-backdrop,var(--segnavia-shot-backdrop,transparent));pointer-events:none}
.segnavia-stage__canvas>iframe{position:absolute;inset:0;inline-size:100%;block-size:100%;border:0;margin:0}
.segnavia-stage__annotations{pointer-events:none;color:var(--segnavia-annotation-color,#e5484d)}
[data-annotation]{opacity:1}
@container (max-width:${COMPACT_PLAYER_WIDTH}px){ol{flex-direction:row;block-size:auto;inline-size:100%;padding:8px 12px;--_fade-dir:to right}
:host([dir="rtl"]) ol{--_fade-dir:to left}
button[data-insert="before"]::before,button[data-insert="after"]::after{inset-block:0;inline-size:3px;block-size:auto}
button[data-insert="before"]::before{inset-inline-start:-6px;inset-inline-end:auto}button[data-insert="after"]::after{inset-inline-end:-6px;inset-inline-start:auto}}
`

export interface RailReorderIntent {
  fromIndex: number
  toIndex: number
}

export interface RailSlideSettingsItem {
  slideId: string
  label: string
  markLabel?: string
}

export class SegnaviaRail extends SegnaviaControl {
  mountMargin = 400
  private observer: IntersectionObserver | null = null
  private resize = new ResizeObserver(() => {
    this.measure()
    this.markOverflow()
  })
  private selected = 0
  private active = -1
  private reorderEnabled = false
  private drag = new RailDragReorder({
    root: this.root,
    enabled: () => this.reorderEnabled,
    count: () => this.controller?.state.deck?.slides.length ?? 0,
    horizontal: () => getComputedStyle(this.root.querySelector('ol') as HTMLOListElement).flexDirection === 'row',
    direction: () => this.controller?.state.direction ?? 'ltr',
    buttons: () => this.itemElements(),
    reorder: (fromIndex, toIndex) => this.emitReorder(fromIndex, toIndex),
  })
  private reorderListeners = new Set<(intent: RailReorderIntent) => void>()
  private slideSettings = new Map<string, RailSlideSettingsItem>()
  private openSlideSettings: ((slideId: string, anchor: HTMLButtonElement) => void) | null = null

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
    this.drag.attach()
    this.root.addEventListener('scroll', this.markOverflow, { capture: true, passive: true })
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
    this.markOverflow()
  }

  refresh() {
    if (this.controller?.state.deck) this.render(this.controller.state)
  }

  setReorderEnabled(enabled: boolean) {
    this.reorderEnabled = enabled
    for (const button of this.itemElements()) button.draggable = enabled
    if (!enabled) this.drag.clear()
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

  setSlideSettings(items: readonly RailSlideSettingsItem[], open: ((slideId: string, anchor: HTMLButtonElement) => void) | null) {
    this.slideSettings = new Map(items.map((item) => [item.slideId, item]))
    this.openSlideSettings = open
    for (const item of this.root.querySelectorAll<HTMLLIElement>('li[data-slide-id]')) this.decorateSlideSettings(item, item.dataset.slideId ?? '')
  }

  animationMessage(event: MessageEvent): { slideId: string; animated: boolean; lengthMs: number | null } | null {
    for (const item of this.root.querySelectorAll<HTMLLIElement>('li[data-slide-id]')) {
      const frame = item.querySelector('iframe')
      const report = animationMessage(event, frame)
      if (report) return { slideId: item.dataset.slideId ?? '', animated: report.animated, lengthMs: report.lengthMs }
    }
    return null
  }

  itemForSlide(slideId: string): HTMLLIElement | null {
    return [...this.root.querySelectorAll<HTMLLIElement>('li[data-slide-id]')].find((item) => item.dataset.slideId === slideId) ?? null
  }

  requestAnimationReports() {
    for (const frame of this.root.querySelectorAll<HTMLIFrameElement>('iframe')) frame.contentWindow?.postMessage({ type: MESSAGE.inspect }, '*')
  }

  protected clicked(event: Event) {
    const menu = (event.target as Element).closest<HTMLButtonElement>('.slide-menu')
    if (menu) {
      const slideId = menu.closest<HTMLLIElement>('li')?.dataset.slideId
      if (slideId) this.openSlideSettings?.(slideId, menu)
      return
    }
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
      this.decorateSlideSettings(item, slide.id)
    })
  }

  private decorateSlideSettings(item: HTMLLIElement, slideId: string) {
    const authoring = this.slideSettings.get(slideId)
    let menu = item.querySelector<HTMLButtonElement>('.slide-menu')
    let mark = item.querySelector<HTMLElement>('.print-mark')
    if (!authoring) {
      menu?.remove()
      mark?.remove()
      return
    }
    if (!menu) {
      menu = document.createElement('button')
      menu.type = 'button'
      menu.className = 'slide-menu'
      menu.textContent = '⋯'
      item.append(menu)
    }
    menu.setAttribute('aria-label', authoring.label)
    if (!authoring.markLabel) return mark?.remove()
    if (!mark) {
      mark = document.createElement('span')
      mark.className = 'print-mark'
      mark.textContent = '⎙'
      mark.setAttribute('role', 'img')
      item.append(mark)
    }
    mark.setAttribute('aria-label', authoring.markLabel)
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
        const canvas = thumbnailCanvas(controller, deck, slide, index, content, '', true)
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

  private markOverflow = () => {
    const list = this.root.querySelector('ol') as HTMLOListElement | null
    if (!list) return
    const horizontal = getComputedStyle(list).flexDirection === 'row'
    const edges = horizontal
      ? railOverflow(list.scrollLeft, list.clientWidth, list.scrollWidth)
      : railOverflow(list.scrollTop, list.clientHeight, list.scrollHeight)
    list.toggleAttribute('data-more-before', edges.before)
    list.toggleAttribute('data-more-after', edges.after)
  }

  private onKey = (event: KeyboardEvent) => {
    if (!this.controller?.state.deck) return
    if ((event.target as Element).closest('.slide-menu,.slide-settings-list,.slide-settings-panel')) return
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

  private emitReorder(fromIndex: number, toIndex: number) {
    for (const listener of this.reorderListeners) listener({ fromIndex, toIndex })
  }
}
