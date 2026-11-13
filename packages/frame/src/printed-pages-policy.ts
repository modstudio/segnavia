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
  const compose = papers.filter((paper) => within(paper, composeMargin)).map((paper) => paper.page)
  const composing = new Set(compose)
  return {
    compose,
    keep: papers.filter((paper) => composing.has(paper.page) || within(paper, keepMargin)).map((paper) => paper.page),
  }
}

export interface PrintedSpread {
  inlineStart?: number
  inlineEnd?: number
}

export function printedPageSpreads(pageCount: number): PrintedSpread[] {
  if (pageCount < 1) return []
  const spreads: PrintedSpread[] = [{ inlineEnd: 1 }]
  for (let page = 2; page <= pageCount; page += 2) {
    spreads.push({ inlineStart: page, inlineEnd: page + 1 <= pageCount ? page + 1 : undefined })
  }
  return spreads
}

export const PRINTED_PAGES_LAYOUTS = ['single', 'facing'] as const
export type PrintedPagesLayout = (typeof PRINTED_PAGES_LAYOUTS)[number]
export const PRINTED_PAGES_FITS = ['width', 'page', 'none'] as const
export type PrintedPagesFit = (typeof PRINTED_PAGES_FITS)[number]

export function printedPagesOption<const Values extends readonly string[]>(value: string, values: Values, name: string): Values[number] {
  if (!values.includes(value)) throw new RangeError(`${name} must be ${values.map((item) => `'${item}'`).join(' or ')}.`)
  return value as Values[number]
}

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
