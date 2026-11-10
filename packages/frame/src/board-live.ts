import { Imposition, Page } from '@segnavia/format'
import { applyFrameInputs, type BoardFrameInputs } from './board-frame-inputs.ts'
import type { CheckedResolvedBoardItem } from './board-policy.ts'
import { SegnaviaBook } from './book.ts'
import { coverImage } from './cover-element.ts'
import { internalPageLoad, internalPaperPagesLoad, internalThumbnailDeckLoad } from './document-value-load.ts'
import type { MountedElement } from './mounted-element.ts'
import { createPageElement } from './page.ts'
import { SegnaviaPaper } from './paper.ts'
import { SegnaviaThumbnail } from './thumbnail.ts'

export function loadLiveDeck(thumbnail: SegnaviaThumbnail, deck: Parameters<SegnaviaThumbnail[typeof internalThumbnailDeckLoad]>[0]): void {
  thumbnail[internalThumbnailDeckLoad](deck)
}

export function loadLivePage(page: ReturnType<typeof createPageElement>, value: Page): void {
  page[internalPageLoad](Page.parse({ ...value, scripts: 'refuse' }))
}

export function loadLivePaper(paper: SegnaviaPaper, pages: Page[], imposition: Parameters<SegnaviaPaper[typeof internalPaperPagesLoad]>[1]): void {
  paper[internalPaperPagesLoad](
    pages.map((page) => Page.parse({ ...page, scripts: 'refuse' })),
    imposition,
  )
}

export function boardImage(src: string): HTMLImageElement {
  return coverImage(src).element as HTMLImageElement
}

export function boardPlaceholder(): HTMLElement {
  const placeholder = document.createElement('div')
  placeholder.part.add('placeholder')
  return placeholder
}

export function boardShield(): HTMLElement {
  const shield = document.createElement('div')
  shield.className = 'shield'
  return shield
}

function listenForError(element: HTMLElement, failed: (error: unknown) => void): () => void {
  const onError = (event: Event) => {
    event.stopPropagation()
    const errorEvent = event as ErrorEvent
    failed(errorEvent.error ?? errorEvent.message)
  }
  element.addEventListener('error', onError)
  return () => element.removeEventListener('error', onError)
}

export function liveBoardItem(
  resolved: Exclude<CheckedResolvedBoardItem, { kind: 'image' | 'shot' }>,
  failed: (error: unknown) => void,
  inputs: BoardFrameInputs,
): MountedElement {
  if (resolved.kind === 'deck') {
    const thumbnail = new SegnaviaThumbnail()
    const onError = (event: Event) => {
      event.stopPropagation()
      failed((event as CustomEvent).detail)
    }
    thumbnail.addEventListener('segnavia-thumbnail-error', onError)
    thumbnail.resolveSlide = resolved.resolveSlide
    applyFrameInputs(thumbnail, inputs)
    thumbnail.base = resolved.base
    thumbnail.index = 0
    loadLiveDeck(thumbnail, resolved.deck)
    return { element: thumbnail, dispose: () => thumbnail.removeEventListener('segnavia-thumbnail-error', onError) }
  }
  if (resolved.kind === 'page') {
    const page = createPageElement()
    const dispose = listenForError(page, failed)
    applyFrameInputs(page, inputs)
    loadLivePage(page, resolved.page)
    return { element: page, dispose }
  }
  if (resolved.kind === 'paper') {
    const paper = new SegnaviaPaper()
    const dispose = listenForError(paper, failed)
    applyFrameInputs(paper, inputs)
    loadLivePaper(paper, resolved.pages, Imposition.parse(resolved.imposition))
    return { element: paper, dispose }
  }
  const book = new SegnaviaBook()
  let loadError: unknown
  let mounting = true
  const onError = (event: Event) => {
    event.stopPropagation()
    const error = (event as CustomEvent).detail
    if (mounting) loadError = error
    else failed(error)
  }
  book.addEventListener('error', onError)
  applyFrameInputs(book, inputs)
  book.view = { ...resolved.view, scripts: 'refuse' }
  mounting = false
  if (loadError !== undefined) throw loadError
  return { element: book, dispose: () => book.removeEventListener('error', onError) }
}
