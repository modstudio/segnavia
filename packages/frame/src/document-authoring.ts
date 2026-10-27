import type { SegnaviaDocument } from './document.ts'
import { type MovePageHandler, movePageOptimistically, pageIdentityError } from './document-authoring-move.ts'
import { SegnaviaDocumentRail } from './document-rail.ts'
import { itemSettingsOpenEvent } from './item-settings-open.ts'
import { ENGLISH_LABELS } from './labels.ts'

const RAIL_TAG = 'segnavia-document-rail'
if (!customElements.get(RAIL_TAG)) customElements.define(RAIL_TAG, SegnaviaDocumentRail)

export interface DocumentAuthoringHandlers {
  movePage: MovePageHandler
}

export interface DocumentAuthoringOptions {
  itemSettings?: boolean
}

export interface DocumentAuthoringErrorDetail {
  operation: 'movePage'
  pageId: string | null
  message: string
  error: unknown
}

export class DocumentAuthoringController extends EventTarget {
  private readonly rail = new SegnaviaDocumentRail()
  private unsubscribe: (() => void) | null = null
  private pending = false
  private stopped = false
  private identityError: string | null = null
  private currentPage = 0

  constructor(
    private document: SegnaviaDocument,
    private handlers: DocumentAuthoringHandlers,
    private options: DocumentAuthoringOptions,
  ) {
    super()
    this.currentPage = document.currentPageIndex
    this.rail.className = 'segnavia-document__rail'
    this.unsubscribe = this.rail.subscribeReorder(({ fromIndex, toIndex }) => void this.move(fromIndex, toIndex))
    this.document.addEventListener('segnavia-document-page', this.pageChanged)
    this.document.addEventListener('segnavia-document-change', this.documentChanged)
    this.document.addEventListener('segnavia-document-slots', this.slotsChanged)
    this.document.setAuthoringRail(this.rail)
    this.syncItemSettings()
    this.refresh()
  }

  get dirty(): boolean {
    return this.pending
  }

  update(handlers: DocumentAuthoringHandlers, options: DocumentAuthoringOptions = {}): void {
    this.handlers = handlers
    this.options = options
    this.syncItemSettings()
    this.refresh()
  }

  detach(): void {
    if (this.stopped) return
    this.stopped = true
    this.unsubscribe?.()
    this.unsubscribe = null
    this.document.removeEventListener('segnavia-document-page', this.pageChanged)
    this.document.removeEventListener('segnavia-document-change', this.documentChanged)
    this.document.removeEventListener('segnavia-document-slots', this.slotsChanged)
    this.document.setAuthoringRail(null)
  }

  private refresh() {
    const pages = this.document.pages
    this.identityError = pageIdentityError(pages)
    this.rail.slots = this.document.slots
    this.rail.fonts = this.document.fonts
    this.rail.configure(pages, this.document.print, this.document.css, (index) => this.document.scrollToPage(index))
    this.rail.setSelected(this.currentPage)
    this.rail.setReorderEnabled(!this.pending && !this.identityError)
    if (this.identityError)
      queueMicrotask(() => {
        if (!this.stopped && this.identityError) this.error(null, new RangeError(this.identityError))
      })
  }

  private pageChanged = (event: Event) => {
    this.currentPage = (event as CustomEvent<{ index: number }>).detail.index
    this.rail.setSelected(this.currentPage)
  }

  private syncItemSettings() {
    this.rail.setItemSettings(this.options.itemSettings ? ENGLISH_LABELS.itemSettings : null, this.options.itemSettings ? this.openItemSettings : null)
  }

  private openItemSettings = () => {
    const pageId = this.document.pages[this.currentPage]?.id
    if (pageId) this.document.dispatchEvent(itemSettingsOpenEvent({ pageId }))
  }

  private documentChanged = () => this.refresh()

  private slotsChanged = () => {
    this.rail.slots = this.document.slots
    this.rail.fonts = this.document.fonts
  }

  private async move(fromIndex: number, toIndex: number) {
    const pages = [...this.document.pages]
    const pageId = pages[fromIndex]?.id ?? null
    if (this.pending || this.identityError || fromIndex === toIndex) return
    this.pending = true
    this.rail.setReorderEnabled(false)
    this.emitDirty()
    try {
      await movePageOptimistically(
        pages,
        fromIndex,
        toIndex,
        (next) => {
          this.document.pages = next
          if (this.stopped) return
          this.document.setAuthoringRail(this.rail)
          this.rail.configure(next, this.document.print, this.document.css, (index) => this.document.scrollToPage(index))
        },
        () => this.document.pages,
        this.handlers.movePage,
      )
    } catch (error) {
      if (!this.stopped) this.error(pageId, error)
    } finally {
      this.pending = false
      if (!this.stopped) {
        this.refresh()
        this.emitDirty()
      }
    }
  }

  private emitDirty() {
    this.dispatchEvent(new CustomEvent('dirty-change', { detail: { dirty: this.dirty } }))
  }

  private error(pageId: string | null, error: unknown) {
    const detail: DocumentAuthoringErrorDetail = {
      operation: 'movePage',
      pageId,
      message: error instanceof Error ? error.message : String(error),
      error,
    }
    this.dispatchEvent(new CustomEvent<DocumentAuthoringErrorDetail>('authoring-error', { detail }))
  }
}

export function attachDocumentAuthoring(
  document: SegnaviaDocument,
  handlers: DocumentAuthoringHandlers,
  options: DocumentAuthoringOptions = {},
): DocumentAuthoringController {
  return new DocumentAuthoringController(document, handlers, options)
}

export type { MovePageHandler, MovePageInput } from './document-authoring-move.ts'
