import type { ResolvedBoardItem } from './board-policy.ts'
import { SegnaviaBook } from './book.ts'
import { SegnaviaPage } from './page.ts'
import { SegnaviaPaper } from './paper.ts'
import { SegnaviaThumbnail } from './thumbnail.ts'

export interface LiveBoardItem {
  element: HTMLElement
  dispose(): void
}

export function liveBoardItem(resolved: Exclude<ResolvedBoardItem, { kind: 'image' | 'shot' }>, failed: (error: unknown) => void): LiveBoardItem {
  if (resolved.kind === 'deck') {
    const thumbnail = new SegnaviaThumbnail()
    const onError = (event: Event) => {
      event.stopPropagation()
      failed((event as CustomEvent).detail)
    }
    thumbnail.addEventListener('segnavia-thumbnail-error', onError)
    thumbnail.resolveSlide = resolved.resolveSlide
    thumbnail.base = resolved.base
    thumbnail.index = 0
    thumbnail.deck = resolved.deck
    return { element: thumbnail, dispose: () => thumbnail.removeEventListener('segnavia-thumbnail-error', onError) }
  }
  if (resolved.kind === 'page') {
    const page = new SegnaviaPage()
    page.load({ ...resolved.page, scripts: 'refuse' })
    return { element: page, dispose: () => {} }
  }
  if (resolved.kind === 'paper') {
    const paper = new SegnaviaPaper()
    paper.load(
      resolved.pages.map((page) => ({ ...page, scripts: 'refuse' })),
      resolved.imposition,
    )
    return { element: paper, dispose: () => {} }
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
  book.view = { ...resolved.view, scripts: 'refuse' }
  mounting = false
  if (loadError !== undefined) throw loadError
  return { element: book, dispose: () => book.removeEventListener('error', onError) }
}
