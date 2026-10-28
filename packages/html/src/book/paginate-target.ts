import type { PaginateBookPage } from './paginate-types.ts'

export type PaginateTargetPage = Pick<PaginateBookPage, 'blank' | 'flow' | 'role' | 'sectionOpening' | 'windows'>

export interface PaginateTarget {
  flow: string
  heldPage?: number
  top?: number
}

export function heldPageNumber(pages: PaginateTargetPage[], index: number): number {
  const page = pages[index]
  if (!page) return 0
  let seen = 0
  for (let i = 0; i <= index; i++) {
    const held = pages[i]
    if (!held || held.flow !== page.flow || held.blank) continue
    if (held.role !== 'fixed' && !(held.role === 'body' && held.windows.length === 0)) continue
    seen += 1
  }
  return seen
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
  const held = target.heldPage
  if (held !== undefined && Number.isSafeInteger(held) && held > 0) {
    for (let index = 0; index < pages.length; index++) {
      if (pages[index]?.flow === target.flow && heldPageNumber(pages, index) === held) return index
    }
    return undefined
  }
  if (target.top !== undefined) {
    const windowed = windowPageIndex(pages, target.flow, target.top)
    if (windowed !== undefined) return windowed
  }
  return openerPageIndex(pages, target.flow)
}
