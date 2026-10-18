import type { ResolvedBoardItem } from './board-policy.ts'
import { SegnaviaBook } from './book.ts'
import { DeckController } from './controller.ts'
import { SegnaviaPage } from './page.ts'
import { SegnaviaPaper } from './paper.ts'
import { SegnaviaStage } from './stage.ts'

export interface LiveBoardItem {
  element: HTMLElement
  dispose(): void
}

export function liveBoardItem(resolved: Exclude<ResolvedBoardItem, { kind: 'image' | 'shot' }>): LiveBoardItem {
  if (resolved.kind === 'deck') {
    const stage = new SegnaviaStage()
    const controller = new DeckController({ base: resolved.base, resolveSlide: resolved.resolveSlide, hash: null, persist: false })
    stage.controller = controller
    void controller.load({ ...resolved.deck, scripts: 'refuse' }, resolved.base)
    return { element: stage, dispose: () => controller.destroy() }
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
  book.view = { ...resolved.view, scripts: 'refuse' }
  return { element: book, dispose: () => {} }
}
