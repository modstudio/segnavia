export interface PaperExtent {
  page: number
  start: number
  end: number
}

export interface PrintedPagesWindow {
  compose: number[]
  keep: number[]
}

export function printedPagesWindow(
  papers: readonly PaperExtent[],
  scroll: number,
  viewport: number,
  composeMargin: number,
  keepMargin: number,
): PrintedPagesWindow {
  const within = (paper: PaperExtent, margin: number) => paper.end >= scroll - margin && paper.start <= scroll + viewport + margin
  return {
    compose: papers.filter((paper) => within(paper, composeMargin)).map((paper) => paper.page),
    keep: papers.filter((paper) => within(paper, keepMargin)).map((paper) => paper.page),
  }
}

export interface PrintedSpread {
  inlineStart?: number
  inlineEnd?: number
}

export function printedPageSpreads(pageCount: number, _direction: 'ltr' | 'rtl'): PrintedSpread[] {
  if (pageCount < 1) return []
  const spreads: PrintedSpread[] = [{ inlineEnd: 1 }]
  for (let page = 2; page <= pageCount; page += 2) {
    spreads.push({ inlineStart: page, inlineEnd: page + 1 <= pageCount ? page + 1 : undefined })
  }
  return spreads
}

export type PrintedPagesFit = 'width' | 'page' | 'none'

export function printedPagesScale(
  fit: PrintedPagesFit,
  content: { inline: number; block: number },
  available: { inline: number; block: number },
  zoom: number,
): number {
  const fitted =
    fit === 'none' ? 1 : fit === 'width' ? available.inline / content.inline : Math.min(available.inline / content.inline, available.block / content.block)
  return fitted * zoom
}

export function currentPrintedPage(papers: readonly PaperExtent[], readingLine: number): number | undefined {
  const containing = papers.find((paper) => paper.start <= readingLine && paper.end > readingLine)
  if (containing) return containing.page
  return papers.find((paper) => paper.start >= readingLine)?.page ?? papers.at(-1)?.page
}

export function shouldReusePrintedPageSrcdoc(shown: string | undefined, next: string): boolean {
  return shown === next
}
