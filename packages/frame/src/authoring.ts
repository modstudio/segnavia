import type { Deck } from '@segnavia/format'
import { type MoveSlideHandler, moveSlideOptimistically } from './authoring-move.ts'
import { deckPreservesNotes, internalDeckLoad, isInternalDeck, preserveNotesForLoad } from './deck-load-origin.ts'
import { activeNavigationGuard, type NavigationGuardReason, setNavigationGuard } from './navigation-guard.ts'
import { NotesSaveQueue } from './notes-save.ts'
import type { SegnaviaPlayer } from './player.ts'
import type { SegnaviaRail } from './rail.ts'

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class AuthoringController extends EventTarget {
  private pendingMove = false
  private stopped = false
  private rail: SegnaviaRail | null = null
  private unsubscribeReorder: (() => void) | null = null
  private notes: NotesSaveQueue | null = null
  private lastNotes: NotesSaveQueue | null = null
  private notesRoot: HTMLElement | null = null
  private notesSlideId: string | null = null
  private updateGeneration = 0
  private updateTail = Promise.resolve()
  private detachPromise: Promise<void> | null = null
  private renderedDeck: Deck | null = null
  private removeNavigationGuard: (() => void) | null = null

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
    return this.pendingMove || (this.notes?.dirty ?? false)
  }

  // Saves pending notes without starting a save on a clean deck, then returns
  // the deck as the author sees it, including a draft whose save failed.
  // Captures the notes queue before awaiting so a concurrent detach still
  // returns those drafts; after detach, flush uses the last queue the same way.
  async flush(): Promise<Deck | null> {
    const notes = this.notes ?? this.lastNotes
    await notes?.flushAll()
    return this.authoredDeck(notes)
  }

  // The authored deck with each slide's current draft notes, without waiting
  // for a host save to settle. Export and print should use this so a paused
  // save cannot hang the document; flush() still waits for persistence.
  draftDeck(): Deck | null {
    return this.authoredDeck(this.notes ?? this.lastNotes)
  }

  adoptNotes(notes: Record<string, string | null>) {
    if (!this.notes) return
    const slideId = this.player.controller.state.slide?.id
    const field = this.notesRoot?.querySelector('textarea') as HTMLTextAreaElement | null
    let visibleChanged = false
    for (const [id, text] of Object.entries(notes)) {
      if (this.notes.seed(id, text ?? '') && id === slideId) visibleChanged = true
    }
    if (!visibleChanged || !field || !slideId) return
    field.value = this.notes.state(slideId).text
    this.renderNotesStatus()
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
      this.detachNotes()?.dispose()
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

  detach(): Promise<void> {
    if (this.detachPromise) return this.detachPromise
    this.stopped = true
    this.detachReorder()
    const notes = this.detachNotes()
    this.detachPromise = this.finishDetach(notes)
    return this.detachPromise
  }

  private async finishDetach(notes: NotesSaveQueue | null) {
    await notes?.flushAll()
    notes?.dispose()
  }

  private authoredDeck(notes: NotesSaveQueue | null): Deck | null {
    const deck = this.player.controller.state.deck
    if (!deck) return null
    if (!notes) return deck
    return {
      ...deck,
      slides: deck.slides.map((slide) => {
        const text = notes.draft(slide.id)
        if (text === undefined || text === (slide.notes ?? '')) return slide
        return { ...slide, notes: text }
      }),
    }
  }

  private attachNotes(save: NonNullable<AuthoringHandlers['saveNotes']>) {
    const notes = document.createElement('div')
    notes.dataset.authoringNotes = ''
    notes.innerHTML = `${NOTES_CSS}<label><span></span><textarea part="notes-editor" dir="auto"></textarea></label><div data-authoring-status aria-live="polite"></div>`
    this.player.authoringMount().prepend(notes)
    this.notesRoot = notes
    const field = notes.querySelector('textarea') as HTMLTextAreaElement
    field.maxLength = this.options.notesMaxLength
    field.addEventListener('input', this.editNotes)
    field.addEventListener('focus', () => this.refuseStageScripts(true))
    field.addEventListener('blur', () => this.refuseStageScripts(false))
    notes.querySelector('[data-authoring-status]')?.addEventListener('click', this.retryNotes)
    this.notes = new NotesSaveQueue(
      save,
      (dirty) => this.emitDirty(this.pendingMove || dirty),
      undefined,
      (slideId) => {
        if (slideId === this.notesSlideId) this.renderNotesStatus()
      },
      this.notesFailed,
    )
    this.player.controller.addEventListener('change', this.renderNotes)
    this.player.addEventListener('segnavia-labels', this.renderNotes)
    this.removeNavigationGuard = setNavigationGuard(this.player.controller, this.beforeNavigate)
    this.renderNotes()
  }

  private beforeNavigate = async (reason: NavigationGuardReason) => {
    const slideId = this.player.controller.state.slide?.id
    const notes = this.notes
    if (!slideId || !notes) return
    if (reason === 'load' && notes.hasLocalWork(slideId)) {
      const load = activeNavigationGuard(this.player.controller)
      if (load) {
        preserveNotesForLoad(load, slideId)
        void notes.flush(slideId)
        return
      }
    }
    await notes.flush(slideId)
  }

  private emitDirty(dirty: boolean) {
    this.dispatchEvent(new CustomEvent<DirtyChangeDetail>('dirty-change', { detail: { dirty } }))
  }

  private detachNotes(): NotesSaveQueue | null {
    const notes = this.notes
    this.player.controller.removeEventListener('change', this.renderNotes)
    this.player.removeEventListener('segnavia-labels', this.renderNotes)
    this.removeNavigationGuard?.()
    this.removeNavigationGuard = null
    this.notes = null
    if (notes) this.lastNotes = notes
    this.notesRoot?.remove()
    this.notesRoot = null
    this.notesSlideId = null
    this.renderedDeck = null
    this.refuseStageScripts(false)
    return notes
  }

  private renderNotes = () => {
    const slide = this.player.controller.state.slide
    const deck = this.player.controller.state.deck
    const field = this.notesRoot?.querySelector('textarea') as HTMLTextAreaElement | null
    const label = this.notesRoot?.querySelector('label span')
    if (!slide || !field || !this.notes) return
    let visibleChanged = false
    const adoptDeck = deck !== this.renderedDeck && deck !== null && !isInternalDeck(deck)
    this.renderedDeck = deck
    if (adoptDeck) {
      for (const deckSlide of deck?.slides ?? []) {
        if (deckPreservesNotes(deck, deckSlide.id)) continue
        const hostNotes = deckSlide.notes ?? ''
        const adopted = this.notes.seed(deckSlide.id, hostNotes)
        if (deckSlide.id === slide.id) visibleChanged = adopted
      }
    }
    if (this.notesSlideId !== slide.id || visibleChanged) {
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

  private notesFailed = (slideId: string, error: unknown) => {
    const detail: AuthoringErrorDetail = { operation: 'notes', slideId, message: errorMessage(error), error }
    this.dispatchEvent(new CustomEvent<AuthoringErrorDetail>('authoring-error', { detail }))
  }

  private refuseStageScripts(refused: boolean) {
    this.player.setAuthoringScriptsRefused(refused)
  }

  private attachReorder() {
    this.rail = this.player.authoringRail()
    this.rail.setReorderEnabled(true)
    this.unsubscribeReorder = this.rail.subscribeReorder(({ fromIndex, toIndex }) => void this.move(fromIndex, toIndex))
  }

  private detachReorder() {
    this.unsubscribeReorder?.()
    this.unsubscribeReorder = null
    this.rail?.setReorderEnabled(false)
    this.rail = null
  }

  private async move(fromIndex: number, toIndex: number) {
    const handler = this.handlers.moveSlide
    const slideId = this.player.controller.state.deck?.slides[fromIndex]?.id
    if (!handler || !slideId || this.pendingMove || fromIndex === toIndex) return
    this.pendingMove = true
    this.rail?.setReorderEnabled(false)
    this.emitDirty(true)
    try {
      await moveSlideOptimistically(this.player.controller, fromIndex, toIndex, handler, this.loadInternalDeck)
    } catch (error) {
      const detail: AuthoringErrorDetail = { operation: 'move', slideId, message: errorMessage(error), error }
      this.dispatchEvent(new CustomEvent<AuthoringErrorDetail>('authoring-error', { detail }))
    } finally {
      this.pendingMove = false
      this.rail?.setReorderEnabled(true)
      this.emitDirty(this.dirty)
    }
  }

  private loadInternalDeck = async (deck: Deck) => {
    await this.player.controller[internalDeckLoad](deck)
  }
}

export function attachAuthoring(player: SegnaviaPlayer, handlers: AuthoringHandlers, options: AuthoringOptions = {}): AuthoringController {
  return new AuthoringController(player, handlers, { notesMaxLength: options.notesMaxLength ?? 20_000 })
}
