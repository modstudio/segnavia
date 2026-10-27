export interface PaginateTargetPage {
  blank: boolean
  flow: string
  role: string
  sectionOpening: boolean
  windows: Array<{ flow: string; start: number; end: number }>
}

export interface PaginateTarget {
  flow: string
  designedPage?: number
  top?: number
}

export function pageIndexForTarget(pages: PaginateTargetPage[], target: PaginateTarget): number | undefined {
  const designed = target.designedPage
  if (designed !== undefined && Number.isSafeInteger(designed) && designed > 0) {
    let seen = 0
    for (const [index, page] of pages.entries()) {
      if (page.flow !== target.flow || page.role !== 'fixed') continue
      seen += 1
      if (seen === designed) return index
    }
    return undefined
  }
  if (target.top !== undefined) {
    for (const [index, page] of pages.entries()) {
      if (page.blank) continue
      for (const win of page.windows) {
        if (win.flow === target.flow && target.top >= win.start && target.top < win.end) return index
      }
    }
  }
  for (const [index, page] of pages.entries()) {
    if (!page.blank && page.flow === target.flow && page.sectionOpening) return index
  }
}
