import { Imposition, Page, type PageWidths } from '@segnavia/format'
import type { CheckedResolvedBoardItem, AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import { SegnaviaBook } from './book.ts'
import { coverImage } from './cover-element.ts'
import { internalPageLoad, internalPaperPagesLoad, internalThumbnailDeckLoad } from './document-value-load.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import type { MountedElement } from './mounted-element.ts'
import { createPageElement } from './page.ts'
import type { FontsOptions } from './page-fonts.ts'
import { SegnaviaPaper } from './paper.ts'
import { SegnaviaThumbnail } from './thumbnail.ts'

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
  motifs?: MotifsOptions,
  fonts?: FontsOptions,
  placements?: PlacementsOptions,
  pageWidths?: PageWidths,
): MountedElement {
  if (resolved.kind === 'deck') {
    const thumbnail = new SegnaviaThumbnail()
    const onError = (event: Event) => {
      event.stopPropagation()
      failed((event as CustomEvent).detail)
    }
    thumbnail.addEventListener('segnavia-thumbnail-error', onError)
    thumbnail.resolveSlide = resolved.resolveSlide
    thumbnail.placements = placements
    thumbnail.pageWidths = pageWidths
    thumbnail.base = resolved.base
    thumbnail.index = 0
    thumbnail[internalThumbnailDeckLoad](resolved.deck)
    return { element: thumbnail, dispose: () => thumbnail.removeEventListener('segnavia-thumbnail-error', onError) }
  }
  if (resolved.kind === 'page') {
    const page = createPageElement()
    const dispose = listenForError(page, failed)
    page.motifs = motifs
    page.fonts = fonts
    page.placements = placements
    page.pageWidths = pageWidths
    page[internalPageLoad](Page.parse({ ...resolved.page, scripts: 'refuse' }))
    return { element: page, dispose }
  }
  if (resolved.kind === 'paper') {
    const paper = new SegnaviaPaper()
    const dispose = listenForError(paper, failed)
    paper.motifs = motifs
    paper.fonts = fonts
    paper.placements = placements
    paper.pageWidths = pageWidths
    paper[internalPaperPagesLoad](
      resolved.pages.map((page) => Page.parse({ ...page, scripts: 'refuse' })),
      Imposition.parse(resolved.imposition),
    )
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
  book.motifs = motifs
  book.fonts = fonts
  book.placements = placements
  book.pageWidths = pageWidths
  book.view = { ...resolved.view, scripts: 'refuse' }
  mounting = false
  if (loadError !== undefined) throw loadError
  return { element: book, dispose: () => book.removeEventListener('error', onError) }
}
