import type { Deck } from '@segnavia/format'
import { AuthoringItemSettings } from './authoring-item-settings.ts'
import { type MoveSlideHandler, moveSlideOptimistically } from './authoring-move.ts'
import { AuthoringPrintMoment, type SavePrintMoment, type SavePrintMomentInput } from './authoring-print-moment.ts'
import { NOTES_CSS } from './authoring-style.ts'
import { deckPreservesNotes, internalDeckLoad, isInternalDeck, preserveNotesForLoad } from './deck-load-origin.ts'
import type { ItemSettingsSection } from './item-settings-section.ts'
import { activeNavigationGuard, type NavigationGuardReason, setNavigationGuard } from './navigation-guard.ts'
import { NotesSaveQueue } from './notes-save.ts'
import type { SegnaviaPlayer } from './player.ts'
import type { SegnaviaRail } from './rail.ts'

export interface SaveNotesInput {
  slideId: string
  notes: string
}

export interface AuthoringHandlers {
  moveSlide?: MoveSlideHandler
  saveNotes?: (input: SaveNotesInput) => Promise<void>
  savePrintMoment?: SavePrintMoment
}

export interface AuthoringOptions {
  notesMaxLength?: number
  itemSettings?: boolean
}

export interface AuthoringErrorDetail {
  operation: 'move' | 'notes' | 'printMoment'
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
  private printMoment: AuthoringPrintMoment | null = null
  private lastPrintMoment: AuthoringPrintMoment | null = null
  private updateGeneration = 0
  private updateTail = Promise.resolve()
  private detachPromise: Promise<void> | null = null
  private renderedDeck: Deck | null = null
  private removeNavigationGuard: (() => void) | null = null
  private itemSettings: AuthoringItemSettings

  constructor(
    private player: SegnaviaPlayer,
    private handlers: AuthoringHandlers,
    readonly options: AuthoringOptions & { notesMaxLength: number },
  ) {
    super()
    if (handlers.moveSlide) this.attachReorder()
    if (handlers.saveNotes) this.attachNotes(handlers.saveNotes)
    if (handlers.savePrintMoment) this.attachPrintMoment(handlers.savePrintMoment)
    this.itemSettings = new AuthoringItemSettings(player, () => this.printMoment, options.itemSettings ?? false)
    this.syncNavigationGuard()
  }

  get dirty(): boolean {
    return this.pendingMove || (this.notes?.dirty ?? false) || (this.printMoment?.queue.dirty ?? false)
  }

  // Saves pending notes without starting a save on a clean deck, then returns
  // the deck as the author sees it, including a draft whose save failed.
  // Captures the notes queue before awaiting so a concurrent detach still
  // returns those drafts; after detach, flush uses the last queue the same way.
  async flush(): Promise<Deck | null> {
    const notes = this.notes ?? this.lastNotes
    const printMoment = this.printMoment ?? this.lastPrintMoment
    await Promise.all([notes?.flushAll(), printMoment?.queue.flushAll()])
    return this.authoredDeck(notes, printMoment)
  }

  // The authored deck with each slide's current draft notes, without waiting
  // for a host save to settle. Export and print should use this so a paused
  // save cannot hang the document; flush() still waits for persistence.
  draftDeck(): Deck | null {
    return this.authoredDeck(this.notes ?? this.lastNotes, this.printMoment ?? this.lastPrintMoment)
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
    const hadPrintMoment = Boolean(this.handlers.savePrintMoment)
    const hasMove = Boolean(handlers.moveSlide)
    const hasNotes = Boolean(handlers.saveNotes)
    const hasPrintMoment = Boolean(handlers.savePrintMoment)
    if (hadNotes && !hasNotes && !(await this.removeNotesForUpdate(generation))) return
    if (hadPrintMoment && !hasPrintMoment && !(await this.removePrintMomentForUpdate(generation))) return
    if (!(await this.replaceSaveHandlers(handlers, hadNotes, hadPrintMoment))) return
    if (this.stopped || generation !== this.updateGeneration) return
    this.handlers = handlers
    if (!hadMove && hasMove) this.attachReorder()
    else if (hadMove && !hasMove) this.detachReorder()
    if (!hadNotes && handlers.saveNotes) this.attachNotes(handlers.saveNotes)
    if (!hadPrintMoment && handlers.savePrintMoment) this.attachPrintMoment(handlers.savePrintMoment)
    this.syncNavigationGuard()
    this.options.notesMaxLength = options.notesMaxLength ?? 20_000
    this.options.itemSettings = options.itemSettings ?? false
    this.itemSettings.update(this.options.itemSettings)
    const field = this.notesRoot?.querySelector('textarea') as HTMLTextAreaElement | null
    if (field) field.maxLength = this.options.notesMaxLength
  }

  private async replaceSaveHandlers(handlers: AuthoringHandlers, hadNotes: boolean, hadPrintMoment: boolean): Promise<boolean> {
    if (hadNotes && handlers.saveNotes && handlers.saveNotes !== this.handlers.saveNotes && !(await this.notes?.setSave(handlers.saveNotes))) return false
    if (hadPrintMoment && handlers.savePrintMoment && handlers.savePrintMoment !== this.handlers.savePrintMoment) {
      return (await this.printMoment?.setSave(handlers.savePrintMoment)) !== false
    }
    return true
  }

  private async removeNotesForUpdate(generation: number): Promise<boolean> {
    const saved = await this.notes?.flushAll()
    if (this.stopped || generation !== this.updateGeneration || saved === false) return false
    this.detachNotes()?.dispose()
    return true
  }

  private async removePrintMomentForUpdate(generation: number): Promise<boolean> {
    const saved = await this.printMoment?.queue.flushAll()
    if (this.stopped || generation !== this.updateGeneration || saved === false) return false
    this.detachPrintMoment()
    return true
  }

  detach(): Promise<void> {
    if (this.detachPromise) return this.detachPromise
    this.stopped = true
    this.itemSettings.dispose()
    this.detachReorder()
    const notes = this.detachNotes()
    const printMoment = this.detachPrintMoment()
    this.syncNavigationGuard()
    this.detachPromise = this.finishDetach(notes, printMoment)
    return this.detachPromise
  }

  private async finishDetach(notes: NotesSaveQueue | null, printMoment: AuthoringPrintMoment | null) {
    await Promise.all([notes?.flushAll(), printMoment?.queue.flushAll()])
    notes?.dispose()
  }

  private authoredDeck(notes: NotesSaveQueue | null, printMoment: AuthoringPrintMoment | null): Deck | null {
    const deck = this.player.controller.state.deck
    if (!deck) return null
    if (!notes && !printMoment) return deck
    return {
      ...deck,
      slides: deck.slides.map((slide) => {
        const text = notes?.draft(slide.id)
        const moment = printMoment?.queue.draft(slide.id)
        const notesChanged = text !== undefined && text !== (slide.notes ?? '')
        const momentChanged = moment !== undefined && moment !== (slide.printAtMs ?? null)
        if (!notesChanged && !momentChanged) return slide
        const authored = { ...slide, ...(notesChanged ? { notes: text } : {}) }
        if (!momentChanged) return authored
        if (moment === null) {
          const { printAtMs: _, ...withoutPrintMoment } = authored
          return withoutPrintMoment
        }
        return { ...authored, printAtMs: moment }
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
      () => this.emitDirty(),
      undefined,
      (slideId) => {
        if (slideId === this.notesSlideId) this.renderNotesStatus()
      },
      this.notesFailed,
    )
    this.player.controller.addEventListener('change', this.renderNotes)
    this.player.addEventListener('segnavia-labels', this.renderNotes)
    this.renderNotes()
  }

  private beforeNavigate = async (reason: NavigationGuardReason) => {
    this.printMoment?.beforeNavigate()
    const slideId = this.player.controller.state.slide?.id
    const notes = this.notes
    if (!slideId) return
    if (notes && reason === 'load' && notes.hasLocalWork(slideId)) {
      const load = activeNavigationGuard(this.player.controller)
      if (load) {
        preserveNotesForLoad(load, slideId)
        void notes.flush(slideId)
        await this.printMoment?.queue.flush(slideId)
        return
      }
    }
    await notes?.flush(slideId)
    await this.printMoment?.queue.flush(slideId)
  }

  private syncNavigationGuard() {
    this.removeNavigationGuard?.()
    this.removeNavigationGuard = null
    if (this.notes || this.printMoment) this.removeNavigationGuard = setNavigationGuard(this.player.controller, this.beforeNavigate)
  }

  private emitDirty() {
    this.dispatchEvent(new CustomEvent<DirtyChangeDetail>('dirty-change', { detail: { dirty: this.dirty } }))
  }

  private detachNotes(): NotesSaveQueue | null {
    const notes = this.notes
    this.player.controller.removeEventListener('change', this.renderNotes)
    this.player.removeEventListener('segnavia-labels', this.renderNotes)
    this.notes = null
    if (notes) this.lastNotes = notes
    this.notesRoot?.remove()
    this.notesRoot = null
    this.notesSlideId = null
    this.renderedDeck = null
    this.refuseStageScripts(false)
    return notes
  }

  private attachPrintMoment(save: SavePrintMoment) {
    this.printMoment = new AuthoringPrintMoment(this.player, save, () => this.emitDirty(), this.printMomentFailed)
  }

  slideSettingsSection(): ItemSettingsSection {
    return this.itemSettings.section()
  }

  private detachPrintMoment(): AuthoringPrintMoment | null {
    const printMoment = this.printMoment
    this.printMoment = null
    if (printMoment) {
      this.lastPrintMoment = printMoment
      printMoment.dispose()
    }
    return printMoment
  }

  private printMomentFailed = (slideId: string, error: unknown) => {
    const detail: AuthoringErrorDetail = { operation: 'printMoment', slideId, message: errorMessage(error), error }
    this.dispatchEvent(new CustomEvent<AuthoringErrorDetail>('authoring-error', { detail }))
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
    this.emitDirty()
    try {
      await moveSlideOptimistically(this.player.controller, fromIndex, toIndex, handler, this.loadInternalDeck)
    } catch (error) {
      const detail: AuthoringErrorDetail = { operation: 'move', slideId, message: errorMessage(error), error }
      this.dispatchEvent(new CustomEvent<AuthoringErrorDetail>('authoring-error', { detail }))
    } finally {
      this.pendingMove = false
      this.rail?.setReorderEnabled(true)
      this.emitDirty()
    }
  }

  private loadInternalDeck = async (deck: Deck) => {
    await this.player.controller[internalDeckLoad](deck)
  }
}

export function attachAuthoring(player: SegnaviaPlayer, handlers: AuthoringHandlers, options: AuthoringOptions = {}): AuthoringController {
  return new AuthoringController(player, handlers, { notesMaxLength: options.notesMaxLength ?? 20_000, itemSettings: options.itemSettings ?? false })
}

export { slideSettingsSection } from './slide-settings-section.ts'

export type { SavePrintMomentInput }
