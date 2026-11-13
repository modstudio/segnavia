import { type Page, type ParentRules, PX_PER_MM, Refusal, type ResolvedParentPage, textArea } from '@segnavia/format'
import type { PrintedHtmlPage } from '@segnavia/html'
import { selectParent } from '@segnavia/layout'

export class PrintedPagesRefusedError extends Refusal {
  constructor(message: string) {
    super('printed-pages', message)
    this.name = 'PrintedPagesRefusedError'
  }
}

export interface PrintedPageGeometry {
  paperWidth: number
  paperHeight: number
  textWidth: number
  textHeight: number
  firstHeight: number
}

function assertCandidate(
  parent: ResolvedParentPage,
  normal: ResolvedParentPage,
  normalSize: { width: number; height: number },
  candidate: { width: number; height: number },
  solelyFirst: boolean,
): void {
  if (candidate.width <= 0) {
    throw new PrintedPagesRefusedError(
      `Parent page "${parent.name}" could not establish a positive text width; reduce its inner plus outer margins to clear this refusal.`,
    )
  }
  if (candidate.height <= 0) {
    throw new PrintedPagesRefusedError(
      `Parent page "${parent.name}" could not establish a positive text height; reduce its top plus bottom margins to clear this refusal.`,
    )
  }
  if (Math.abs(candidate.width - normalSize.width) > 0.001) {
    throw new PrintedPagesRefusedError(
      `Parent pages "${normal.name}" and "${parent.name}" could not establish one text width; make their inner plus outer margins equal to clear this refusal.`,
    )
  }
  if (!solelyFirst && Math.abs(candidate.height - normalSize.height) > 0.001) {
    throw new PrintedPagesRefusedError(
      `Parent pages "${normal.name}" and "${parent.name}" could not establish one text height outside the first page; make their top plus bottom margins equal to clear this refusal.`,
    )
  }
}

function firstHeight(
  rules: ParentRules,
  byName: ReadonlyMap<string, ResolvedParentPage>,
  normal: ResolvedParentPage,
  height: number,
  textHeight: number,
): number {
  const name = selectParent(rules, {
    documentFirst: true,
    documentLast: false,
    sectionFirst: true,
    sectionLast: false,
    face: 'recto',
    blank: false,
  })
  const first = byName.get(name) as ResolvedParentPage
  const candidate = textArea(first, { width: 0, height }).height
  if (candidate <= 0) {
    throw new PrintedPagesRefusedError(
      `First parent page "${first.name}" could not establish a positive text height; reduce its top plus bottom margins to clear this refusal.`,
    )
  }
  if (candidate > textHeight + 0.001) {
    throw new PrintedPagesRefusedError(
      `First parent page "${first.name}" has a taller text height than "${normal.name}"; increase its top plus bottom margins to clear this refusal.`,
    )
  }
  return candidate
}

function assertLastMargins(rules: ParentRules, byName: ReadonlyMap<string, ResolvedParentPage>, normal: ResolvedParentPage): void {
  for (const rule of rules.filter((candidate) => candidate.when?.position === 'documentLast')) {
    const last = byName.get(rule.parent) as ResolvedParentPage
    if (JSON.stringify(last.margin) === JSON.stringify(normal.margin)) continue
    throw new PrintedPagesRefusedError(
      `Last parent page "${last.name}" could not establish geometry independent of which page is last; give it the same margins as "${normal.name}" to clear this refusal.`,
    )
  }
}

export function printedPageGeometry(page: PrintedHtmlPage, parents: ResolvedParentPage[], width: number, height: number): PrintedPageGeometry {
  const printed = page.printedPages as NonNullable<Page['printedPages']>
  const byName = new Map(parents.map((parent) => [parent.name, parent]))
  const normal = byName.get(printed.parentRules.at(-1)?.parent ?? '') as ResolvedParentPage
  const paper = { width, height }
  const normalSize = textArea(normal, paper)
  assertCandidate(normal, normal, normalSize, normalSize, false)
  const ruleLists = [printed.parentRules, ...(printed.sections?.flatMap((section) => (section.parentRules ? [section.parentRules] : [])) ?? [])]
  let openingHeight = normalSize.height
  for (const rules of ruleLists) {
    for (const name of new Set(rules.map((rule) => rule.parent))) {
      const parent = byName.get(name) as ResolvedParentPage
      const solelyFirst = rules.every((rule) => rule.parent !== name || rule.when?.position === 'documentFirst')
      assertCandidate(parent, normal, normalSize, textArea(parent, paper), solelyFirst)
    }
    openingHeight = Math.min(openingHeight, firstHeight(rules, byName, normal, height, normalSize.height))
    assertLastMargins(rules, byName, normal)
  }
  return {
    paperWidth: width * PX_PER_MM,
    paperHeight: height * PX_PER_MM,
    textWidth: normalSize.width * PX_PER_MM,
    textHeight: normalSize.height * PX_PER_MM,
    firstHeight: openingHeight * PX_PER_MM,
  }
}
