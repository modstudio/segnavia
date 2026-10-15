import type { TextDirection } from '@segnavia/format'
import { type MoveSlideHandler, moveSlideOptimistically, railMoveTarget } from './authoring-move.ts'
import type { SegnaviaPlayer } from './player.ts'

export interface SaveNotesInput {
  slideId: string
  notes: string
}

export interface AuthoringHandlers {
  moveSlide?: MoveSlideHandler
  saveNotes?: (input: SaveNotesInput) => Promise<void>
}

export interface AuthoringOptions {
  notesMaxLength?: number
}

export interface AuthoringErrorDetail {
  operation: 'move' | 'notes'
  slideId: string
  message: string
  error: unknown
}

export interface DirtyChangeDetail {
  dirty: boolean
}

interface RailElement extends HTMLElement {
  shadowRoot: ShadowRoot
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function keyboardMove(key: string, index: number, count: number, horizontal: boolean, direction: TextDirection): number {
  if (!horizontal) return key === 'ArrowUp' ? index - 1 : key === 'ArrowDown' ? index + 1 : index
  if (key === 'ArrowLeft') return index + (direction === 'rtl' ? 1 : -1)
  if (key === 'ArrowRight') return index + (direction === 'rtl' ? -1 : 1)
  return Math.max(0, Math.min(count - 1, index))
}

export class AuthoringController extends EventTarget {
  private pendingMove = false
  private stopped = false
  private dragFrom: number | null = null
  private rail: RailElement | null = null

  constructor(
    private player: SegnaviaPlayer,
    private handlers: AuthoringHandlers,
    readonly options: Required<AuthoringOptions>,
  ) {
    super()
    if (handlers.moveSlide) this.attachReorder()
  }

  get dirty(): boolean {
    return false
  }

  detach() {
    if (this.stopped) return
    this.stopped = true
    this.player.controller.removeEventListener('change', this.configureReorder)
    this.removeRailListeners()
  }

  private attachReorder() {
    this.player.controller.addEventListener('change', this.configureReorder)
    this.configureReorder()
  }

  private configureReorder = () => {
    const next = this.player.shadowRoot?.querySelector('segnavia-rail') as RailElement | null
    if (next !== this.rail) {
      this.removeRailListeners()
      this.rail = next
      const root = next?.shadowRoot
      root?.addEventListener('keydown', this.onKey as EventListener)
      root?.addEventListener('dragstart', this.onDragStart as EventListener)
      root?.addEventListener('dragover', this.onDragOver as EventListener)
      root?.addEventListener('drop', this.onDrop as EventListener)
      root?.addEventListener('dragend', this.onDragEnd)
    }
    for (const button of this.buttons()) button.draggable = true
  }

  private buttons(): HTMLButtonElement[] {
    return [...(this.rail?.shadowRoot.querySelectorAll<HTMLButtonElement>('button[data-index]') ?? [])]
  }

  private removeRailListeners() {
    const root = this.rail?.shadowRoot
    root?.removeEventListener('keydown', this.onKey as EventListener)
    root?.removeEventListener('dragstart', this.onDragStart as EventListener)
    root?.removeEventListener('dragover', this.onDragOver as EventListener)
    root?.removeEventListener('drop', this.onDrop as EventListener)
    root?.removeEventListener('dragend', this.onDragEnd)
    for (const button of this.buttons()) {
      button.draggable = false
      button.removeAttribute('data-insert')
    }
    this.rail = null
  }

  private onKey = (event: KeyboardEvent) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || this.pendingMove) return
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]')
    const state = this.player.controller.state
    if (!button || !state.deck) return
    const horizontal = getComputedStyle(this.rail?.shadowRoot.querySelector('ol') as Element).flexDirection === 'row'
    const from = Number(button.dataset.index)
    const to = keyboardMove(event.key, from, state.deck.slides.length, horizontal, state.direction)
    if (to < 0 || to >= state.deck.slides.length || to === from) return
    event.preventDefault()
    void this.move(from, to)
  }

  private onDragStart = (event: DragEvent) => {
    if (this.pendingMove) return event.preventDefault()
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]')
    if (!button) return
    this.dragFrom = Number(button.dataset.index)
    event.dataTransfer?.setData('text/plain', button.dataset.index ?? '')
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  private onDragOver = (event: DragEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]')
    if (this.dragFrom === null || !button) return
    event.preventDefault()
    const horizontal = getComputedStyle(this.rail?.shadowRoot.querySelector('ol') as Element).flexDirection === 'row'
    const rect = button.getBoundingClientRect()
    const after = horizontal ? event.clientX >= rect.left + rect.width / 2 : event.clientY >= rect.top + rect.height / 2
    for (const item of this.buttons()) item.removeAttribute('data-insert')
    button.dataset.insert = after ? 'after' : 'before'
  }

  private onDrop = (event: DragEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]')
    const count = this.player.controller.state.deck?.slides.length ?? 0
    if (this.dragFrom === null || !button || !count) return
    event.preventDefault()
    const to = railMoveTarget(this.dragFrom, Number(button.dataset.index), button.dataset.insert === 'after', count)
    const from = this.dragFrom
    this.clearDrag()
    void this.move(from, to)
  }

  private onDragEnd = () => this.clearDrag()

  private clearDrag() {
    this.dragFrom = null
    for (const button of this.buttons()) button.removeAttribute('data-insert')
  }

  private async move(fromIndex: number, toIndex: number) {
    const handler = this.handlers.moveSlide
    const slideId = this.player.controller.state.deck?.slides[fromIndex]?.id
    if (!handler || !slideId || this.pendingMove || fromIndex === toIndex) return
    this.pendingMove = true
    try {
      await moveSlideOptimistically(this.player.controller, fromIndex, toIndex, handler)
    } catch (error) {
      const detail: AuthoringErrorDetail = { operation: 'move', slideId, message: errorMessage(error), error }
      this.dispatchEvent(new CustomEvent<AuthoringErrorDetail>('authoring-error', { detail }))
    } finally {
      this.pendingMove = false
      this.configureReorder()
    }
  }
}

export function attachAuthoring(player: SegnaviaPlayer, handlers: AuthoringHandlers, options: AuthoringOptions = {}): AuthoringController {
  return new AuthoringController(player, handlers, { notesMaxLength: options.notesMaxLength ?? 20_000 })
}
