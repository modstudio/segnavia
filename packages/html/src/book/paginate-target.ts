import type { PaginateBookPage } from './paginate-types.ts'

export type PaginateTargetPage = Pick<PaginateBookPage, 'blank' | 'flow' | 'role' | 'sectionOpening' | 'windows'>

export interface PaginateTarget {
  flow: string
  designedPage?: number
  top?: number
}

export function designedPageIndex(pages: PaginateTargetPage[], flow: string, designedPage: number): number | undefined {
  let seen = 0
  for (const [index, page] of pages.entries()) {
    if (page.flow !== flow || page.role !== 'fixed') continue
    seen += 1
    if (seen === designedPage) return index
  }
}

export function windowPageIndex(pages: PaginateTargetPage[], flow: string, top: number): number | undefined {
  for (const [index, page] of pages.entries()) {
    if (page.blank) continue
    for (const win of page.windows) {
      if (win.flow === flow && top >= win.start && top < win.end) return index
    }
  }
}

export function openerPageIndex(pages: PaginateTargetPage[], flow: string): number | undefined {
  for (const [index, page] of pages.entries()) {
    if (!page.blank && page.flow === flow && page.sectionOpening) return index
  }
}

export function pageIndexForTarget(pages: PaginateTargetPage[], target: PaginateTarget): number | undefined {
  const designed = target.designedPage
  if (designed !== undefined && Number.isSafeInteger(designed) && designed > 0) return designedPageIndex(pages, target.flow, designed)
  if (target.top !== undefined) {
    const held = windowPageIndex(pages, target.flow, target.top)
    if (held !== undefined) return held
  }
  return openerPageIndex(pages, target.flow)
}
