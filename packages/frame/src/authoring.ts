import type { TextDirection } from '@segnavia/format'
import { type MoveSlideHandler, moveSlideOptimistically, railMoveTarget } from './authoring-move.ts'
import { setNavigationGuard } from './navigation-guard.ts'
import { NotesSaveQueue } from './notes-save.ts'
import type { SegnaviaPlayer } from './player.ts'
import type { SegnaviaStage } from './stage.ts'

const NOTES_CSS = `<style data-segnavia-authoring>
[data-authoring-notes]{display:grid;gap:6px;padding:12px;border-block-start:1px solid var(--_line);background:var(--_surface)}
[data-authoring-notes] label{font:600 13px/1.4 system-ui;color:var(--_ink)}
[data-authoring-notes] textarea{box-sizing:border-box;inline-size:100%;min-block-size:96px;resize:block;padding:9px 10px;border:1px solid var(--_line);border-radius:8px;background:var(--_bg);color:var(--_ink);font:inherit}
[data-authoring-notes] textarea:focus{outline:2px solid var(--_accent);outline-offset:1px}
[data-authoring-status]{min-block-size:1.4em;color:var(--_muted);font:12px/1.4 system-ui}
[data-authoring-status] button{all:unset;color:var(--_accent);cursor:pointer;text-decoration:underline}
</style>`

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
  private notes: NotesSaveQueue | null = null
  private notesRoot: HTMLElement | null = null
  private notesSlideId: string | null = null
  private updateGeneration = 0
  private updateTail = Promise.resolve()

  constructor(
    private player: SegnaviaPlayer,
    private handlers: AuthoringHandlers,
    readonly options: Required<AuthoringOptions>,
  ) {
    super()
    if (handlers.moveSlide) this.attachReorder()
    if (handlers.saveNotes) this.attachNotes(handlers.saveNotes)
  }

  get dirty(): boolean {
    return this.notes?.dirty ?? false
  }

  update(handlers: AuthoringHandlers, options: AuthoringOptions = {}): Promise<void> {
    const generation = ++this.updateGeneration
    const next = this.updateTail.then(() => this.applyUpdate(generation, handlers, options))
    this.updateTail = next.catch(() => {})
    return next
  }

  private async applyUpdate(generation: number, handlers: AuthoringHandlers, options: AuthoringOptions) {
    if (this.stopped || generation !== this.updateGeneration) return
    const hadMove = Boolean(this.handlers.moveSlide)
    const hadNotes = Boolean(this.handlers.saveNotes)
    const hasMove = Boolean(handlers.moveSlide)
    const hasNotes = Boolean(handlers.saveNotes)
    if (hadNotes && !hasNotes) {
      const saved = await this.notes?.flushAll()
      if (this.stopped || generation !== this.updateGeneration) return
      if (saved === false) return
      this.detachNotes()
    }
    this.handlers = handlers
    if (!hadMove && hasMove) this.attachReorder()
    else if (hadMove && !hasMove) this.detachReorder()
    if (!hadNotes && handlers.saveNotes) this.attachNotes(handlers.saveNotes)
    else if (handlers.saveNotes) this.notes?.setSave(handlers.saveNotes)
    this.options.notesMaxLength = options.notesMaxLength ?? 20_000
    const field = this.notesRoot?.querySelector('textarea') as HTMLTextAreaElement | null
    if (field) field.maxLength = this.options.notesMaxLength
  }

  detach() {
    if (this.stopped) return
    this.stopped = true
    this.detachReorder()
    this.detachNotes()
  }

  private attachNotes(save: NonNullable<AuthoringHandlers['saveNotes']>) {
    const root = this.player.shadowRoot
    const below = root?.querySelector('.below')
    if (!root || !below) return
    root.prepend(document.createRange().createContextualFragment(NOTES_CSS))
    const notes = document.createElement('div')
    notes.dataset.authoringNotes = ''
    notes.innerHTML = '<label><span></span><textarea part="notes-editor" dir="auto"></textarea></label><div data-authoring-status aria-live="polite"></div>'
    below.prepend(notes)
    this.notesRoot = notes
    const field = notes.querySelector('textarea') as HTMLTextAreaElement
    field.maxLength = this.options.notesMaxLength
    field.addEventListener('input', this.editNotes)
    field.addEventListener('focus', () => this.refuseStageScripts(true))
    field.addEventListener('blur', () => this.refuseStageScripts(false))
    notes.querySelector('[data-authoring-status]')?.addEventListener('click', this.retryNotes)
    this.notes = new NotesSaveQueue(
      save,
      (dirty) => this.dispatchEvent(new CustomEvent<DirtyChangeDetail>('dirty-change', { detail: { dirty } })),
      undefined,
      (slideId) => {
        if (slideId === this.notesSlideId) this.renderNotesStatus()
      },
      (slideId, error) => {
        const detail: AuthoringErrorDetail = { operation: 'notes', slideId, message: errorMessage(error), error }
        this.dispatchEvent(new CustomEvent<AuthoringErrorDetail>('authoring-error', { detail }))
      },
    )
    this.player.controller.addEventListener('change', this.renderNotes)
    this.player.addEventListener('segnavia-labels', this.renderNotes)
    setNavigationGuard(this.player.controller, async () => {
      const slideId = this.player.controller.state.slide?.id
      if (slideId) await this.notes?.flush(slideId)
    })
    this.renderNotes()
  }

  private detachNotes() {
    this.player.controller.removeEventListener('change', this.renderNotes)
    this.player.removeEventListener('segnavia-labels', this.renderNotes)
    setNavigationGuard(this.player.controller, null)
    this.notes?.dispose()
    this.notes = null
    this.notesRoot?.remove()
    this.notesRoot = null
    this.notesSlideId = null
    this.player.shadowRoot?.querySelector('style[data-segnavia-authoring]')?.remove()
    this.refuseStageScripts(false)
  }

  private renderNotes = () => {
    const slide = this.player.controller.state.slide
    const field = this.notesRoot?.querySelector('textarea') as HTMLTextAreaElement | null
    const label = this.notesRoot?.querySelector('label span')
    if (!slide || !field || !this.notes) return
    this.notes.seed(slide.id, slide.notes ?? '')
    if (this.notesSlideId !== slide.id) {
      this.notesSlideId = slide.id
      field.value = this.notes.state(slide.id).text
    }
    if (label) label.textContent = this.player.labels.editNotes
    this.renderNotesStatus()
  }

  private renderNotesStatus() {
    if (!this.notesSlideId || !this.notes || !this.notesRoot) return
    const state = this.notes.state(this.notesSlideId)
    const status = this.notesRoot.querySelector('[data-authoring-status]') as HTMLElement
    if (state.status === 'saving') status.textContent = this.player.labels.savingNotes
    else if (state.status === 'saved') status.textContent = this.player.labels.savedNotes
    else if (state.status === 'error') {
      status.replaceChildren()
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.textContent = this.player.labels.tryNotesAgain
      status.append(retry, document.createTextNode(state.message ? `: ${state.message}` : ''))
    } else status.textContent = ''
  }

  private editNotes = (event: Event) => {
    if (this.notesSlideId) this.notes?.edit(this.notesSlideId, (event.currentTarget as HTMLTextAreaElement).value)
  }

  private retryNotes = (event: Event) => {
    if ((event.target as Element).closest('button') && this.notesSlideId) void this.notes?.retry(this.notesSlideId)
  }

  private refuseStageScripts(refused: boolean) {
    const stage = this.player.shadowRoot?.querySelector('segnavia-stage') as SegnaviaStage | null
    stage?.setAuthoringScriptsRefused(refused)
  }

  private attachReorder() {
    this.player.controller.addEventListener('change', this.configureReorder)
    this.configureReorder()
  }

  private detachReorder() {
    this.player.controller.removeEventListener('change', this.configureReorder)
    this.removeRailListeners()
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
    const after = horizontal
      ? this.player.controller.state.direction === 'rtl'
        ? event.clientX < rect.left + rect.width / 2
        : event.clientX >= rect.left + rect.width / 2
      : event.clientY >= rect.top + rect.height / 2
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
