import type { Page, Print } from '@segnavia/format'
import { railSelection } from './rail-navigation.ts'
import { RAIL_REORDER_CSS, RailDragReorder } from './rail-reorder.ts'
import type { SegnaviaThumbnail } from './thumbnail.ts'

const CSS = `
:host{display:block;inline-size:var(--segnavia-rail-size,160px);min-block-size:0;color:var(--segnavia-ink,CanvasText)}
ol{box-sizing:border-box;display:flex;flex-direction:column;gap:10px;max-block-size:100vh;overflow:auto;list-style:none;margin:0;padding:12px}
li{flex:none;position:relative}button{font:inherit}
button[data-index]{all:unset;box-sizing:border-box;display:block;inline-size:100%;cursor:pointer;border-radius:var(--segnavia-radius,10px);position:relative}
button:focus-visible{outline:2px solid var(--segnavia-accent,#356ae6);outline-offset:2px}
.preview{position:relative;display:block;overflow:hidden;inline-size:100%;aspect-ratio:var(--_page-aspect);border:1px solid var(--segnavia-line,color-mix(in srgb,CanvasText 18%,transparent));border-radius:inherit;background:var(--segnavia-surface,Canvas)}
[aria-selected="true"] .preview{border:2px solid var(--segnavia-accent,#356ae6)}
segnavia-thumbnail{inline-size:100%;block-size:100%}
${RAIL_REORDER_CSS}
.number{position:absolute;z-index:2;inset-inline-start:6px;inset-block-end:5px;min-inline-size:1.5em;padding:1px 4px;border-radius:4px;background:color-mix(in srgb,Canvas 84%,transparent);color:CanvasText;font:600 11px/1.4 system-ui;text-align:center}
`

export interface DocumentRailReorderIntent {
  fromIndex: number
  toIndex: number
}

export class SegnaviaDocumentRail extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' })
  private pages: readonly Page[] = []
  private selected = 0
  private enabled = false
  private drag = new RailDragReorder({
    root: this.root,
    enabled: () => this.enabled,
    count: () => this.pages.length,
    horizontal: () => false,
    direction: () => (getComputedStyle(this).direction === 'rtl' ? 'rtl' : 'ltr'),
    buttons: () => this.buttons(),
    reorder: (fromIndex, toIndex) => this.emitReorder(fromIndex, toIndex),
  })
  private listeners = new Set<(intent: DocumentRailReorderIntent) => void>()
  private selectPage: (index: number) => void = () => {}

  constructor() {
    super()
    this.root.innerHTML = `<style>${CSS}</style><ol part="rail"></ol>`
  }

  connectedCallback() {
    this.setAttribute('role', 'listbox')
    this.setAttribute('aria-label', 'Pages')
    this.root.addEventListener('click', this.clicked)
    this.root.addEventListener('keydown', this.keydown as EventListener)
    this.drag.attach()
  }

  configure(pages: readonly Page[], print: Print | null, css: string, select: (index: number) => void) {
    this.pages = pages
    this.selectPage = select
    const list = this.root.querySelector('ol') as HTMLOListElement
    list.replaceChildren()
    pages.forEach((page, index) => {
      const item = document.createElement('li')
      if (page.id) item.dataset.pageId = page.id
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.index = String(index)
      button.draggable = this.enabled
      button.setAttribute('role', 'option')
      button.setAttribute('aria-label', `Page ${index + 1} of ${pages.length}`)
      const preview = document.createElement('span')
      preview.className = 'preview'
      const thumbnail = document.createElement('segnavia-thumbnail') as SegnaviaThumbnail
      thumbnail.page = page
      thumbnail.print = print
      thumbnail.css = css
      preview.append(thumbnail)
      const number = document.createElement('span')
      number.className = 'number'
      number.part.add('thumbnail-number')
      number.textContent = String(index + 1)
      button.append(preview, number)
      item.append(button)
      list.append(item)
    })
    this.setSelected(Math.min(this.selected, Math.max(0, pages.length - 1)))
  }

  setReorderEnabled(enabled: boolean) {
    this.enabled = enabled
    for (const button of this.buttons()) button.draggable = enabled
    if (!enabled) this.drag.clear()
  }

  subscribeReorder(listener: (intent: DocumentRailReorderIntent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setSelected(index: number) {
    this.selected = index
    for (const button of this.buttons()) {
      const current = Number(button.dataset.index) === index
      button.tabIndex = current ? 0 : -1
      button.setAttribute('aria-selected', String(current))
      button.setAttribute('part', current ? 'thumbnail thumbnail-current' : 'thumbnail')
      if (current) button.scrollIntoView({ block: 'nearest' })
    }
  }

  private buttons() {
    return [...this.root.querySelectorAll<HTMLButtonElement>('button[data-index]')]
  }

  private clicked = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]')
    if (!button) return
    const index = Number(button.dataset.index)
    this.setSelected(index)
    this.selectPage(index)
  }

  private keydown = (event: KeyboardEvent) => {
    const from = Number((event.target as Element).closest<HTMLButtonElement>('button[data-index]')?.dataset.index ?? this.selected)
    const direction = getComputedStyle(this).direction === 'rtl' ? 'rtl' : 'ltr'
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && this.enabled) {
      const to = railSelection(from, event.key, this.pages.length, false, direction)
      if (to === from) return
      event.preventDefault()
      this.emitReorder(from, to)
      return
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const next = railSelection(this.selected, event.key, this.pages.length, false, direction)
    if (next === this.selected) return
    event.preventDefault()
    this.setSelected(next)
    this.buttons()[next]?.focus()
  }

  private emitReorder(fromIndex: number, toIndex: number) {
    for (const listener of this.listeners) listener({ fromIndex, toIndex })
  }
}
