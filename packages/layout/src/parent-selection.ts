import {
  DESIGNED_PARENT_RULES,
  defaultParentRules,
  FLOWING_PARENT_RULES,
  type LogicalMargin,
  type ParentRules,
  physicalMargins,
  type RegionEdge,
  TEMPLATED_PARENT_RULES,
  type TextArea,
  type TextDirection,
} from '@segnavia/format'
import type { PaginateBookInput, PaginateBookPage, PaginateBookResult, PaginateFlow } from './paginate-types.ts'

export interface ParentFacts {
  documentFirst: boolean
  documentLast: boolean
  sectionFirst: boolean
  sectionLast: boolean
  face: 'recto' | 'verso'
  blank: boolean
}

export interface RegionBox {
  top: number
  left: number
  width: number
  height: number
}

export function regionBox(edge: RegionEdge, margin: LogicalMargin, textArea: TextArea, side: { direction: TextDirection; face: 'recto' | 'verso' }): RegionBox {
  const physical = physicalMargins(margin, side.direction, side.face)
  if (edge === 'blockStart') return { top: 0, left: physical.left, width: textArea.width, height: physical.top }
  if (edge === 'blockEnd') return { top: physical.top + textArea.height, left: physical.left, width: textArea.width, height: physical.bottom }
  if (edge === 'inlineStart') {
    const bindingLeft = physical.left === margin.inlineStart
    return { top: physical.top, left: bindingLeft ? 0 : physical.left + textArea.width, width: margin.inlineStart, height: textArea.height }
  }
  const outerLeft = physical.left === margin.inlineEnd
  return { top: physical.top, left: outerLeft ? 0 : physical.left + textArea.width, width: margin.inlineEnd, height: textArea.height }
}

export { DESIGNED_PARENT_RULES, defaultParentRules, FLOWING_PARENT_RULES, TEMPLATED_PARENT_RULES }

export function initialParentSelection(
  flow: FinishedFlow,
  facts: { opening: boolean; blank: boolean; role?: 'body' | 'fixed'; pageIndex: number; rules?: ParentRules },
  direction: TextDirection,
  faceOf: (index: number, direction: TextDirection) => { face: 'recto' | 'verso'; side: 'left' | 'right' },
): { parent: string; face: 'recto' | 'verso'; side: 'left' | 'right' } {
  const physical = faceOf(facts.pageIndex, direction)
  const defaults = defaultParentRules(flow.kind, facts.role)
  return {
    parent: selectParent(facts.rules ?? flow.parentRules ?? defaults, {
      documentFirst: facts.pageIndex === 1,
      documentLast: false,
      sectionFirst: facts.opening,
      sectionLast: false,
      face: physical.face,
      blank: facts.blank,
    }),
    ...physical,
  }
}

export function selectParent(rules: ParentRules, facts: ParentFacts): string {
  for (const rule of rules) {
    const when = rule.when
    if (when?.position === 'documentFirst' && !facts.documentFirst) continue
    if (when?.position === 'documentLast' && !facts.documentLast) continue
    if (when?.position === 'sectionFirst' && !facts.sectionFirst) continue
    if (when?.position === 'sectionLast' && !facts.sectionLast) continue
    if (when?.face !== undefined && when.face !== facts.face) continue
    if (when?.blank !== undefined && when.blank !== facts.blank) continue
    return rule.parent
  }
  throw new Error('parentRules could not select a parent; add an unconditional last rule to clear this refusal')
}

export interface SelectedParentPage {
  parent: string
  rules: ParentRules
  facts: Omit<ParentFacts, 'documentLast' | 'sectionLast'>
  sectionLast: boolean
}

export function finalParentSelections(pages: readonly SelectedParentPage[], textAreas: readonly Readonly<Record<string, TextArea>>[]): string[] {
  return pages.map((page, index) => {
    const selected = selectParent(page.rules, {
      ...page.facts,
      documentLast: index === pages.length - 1,
      sectionLast: page.sectionLast,
    })
    const areas = textAreas[index]
    const before = areas?.[page.parent]
    const after = areas?.[selected]
    if (!before) {
      throw Object.assign(
        new Error(
          `page ${index + 1} could not establish a text area for parent "${page.parent}" before the finished-page pass; define that parent's text area to clear this refusal`,
        ),
        { pageIndex: index },
      )
    }
    if (!after) {
      throw Object.assign(
        new Error(
          `page ${index + 1} could not establish a text area for parent "${selected}" after the finished-page pass; define that parent's text area to clear this refusal`,
        ),
        { pageIndex: index },
      )
    }
    if (page.parent !== selected && (before.width !== after.width || before.height !== after.height)) {
      throw Object.assign(
        new Error(
          `page ${index + 1} changes from parent "${page.parent}" to "${selected}" after pagination and could not keep one text area; give both parents the same text area to clear this refusal`,
        ),
        { pageIndex: index },
      )
    }
    return selected
  })
}

type FinishedPage = Pick<PaginateBookPage, 'flow' | 'parent' | 'face' | 'blank' | 'sectionOpening' | 'role' | 'pageGeometry'>

type FixedFlow = Extract<PaginateFlow, { kind: 'fixed' }>
type FinishedFlow = Pick<PaginateFlow, 'id' | 'kind' | 'parentRules'> & Partial<Pick<FixedFlow, 'role' | 'pageParentRules'>>

export function finishedPlanParents(
  pages: readonly FinishedPage[],
  flows: readonly FinishedFlow[],
  areas: Readonly<Record<string, TextArea>>,
  geometryAreas: Readonly<Record<string, Readonly<Record<string, TextArea>>>> = {},
): string[] {
  const byFlow = new Map(flows.map((flow) => [flow.id, flow]))
  const fixedIndexes = new Map<string, number>()
  const selections = pages.map((page, index): SelectedParentPage => {
    const flow = byFlow.get(page.flow)
    const fixedIndex = fixedIndexes.get(page.flow) ?? 0
    const defaults = defaultParentRules(flow?.kind ?? '', flow?.role)
    const pageRules = page.blank ? undefined : flow?.pageParentRules?.[fixedIndex]
    if (flow?.kind === 'fixed' && !page.blank) fixedIndexes.set(page.flow, fixedIndex + 1)
    return {
      parent: page.parent,
      rules: pageRules ?? flow?.parentRules ?? defaults,
      facts: {
        documentFirst: index === 0,
        sectionFirst: page.sectionOpening,
        face: page.face,
        blank: page.blank,
      },
      sectionLast: pages[index + 1]?.flow !== page.flow,
    }
  })
  const perPageAreas = pages.map((page) => (page.pageGeometry ? geometryAreas[page.pageGeometry] : undefined) ?? areas)
  return finalParentSelections(selections, perPageAreas)
}

export function finishedPlanParentResult(
  pages: readonly FinishedPage[],
  flows: readonly FinishedFlow[],
  areas: Readonly<Record<string, TextArea>>,
  geometryAreas?: Readonly<Record<string, Readonly<Record<string, TextArea>>>>,
): { parents: string[] } | { refusal: string; pageIndex?: number } {
  try {
    return { parents: finishedPlanParents(pages, flows, areas, geometryAreas) }
  } catch (error) {
    return {
      refusal: error instanceof Error ? error.message : String(error),
      ...(typeof error === 'object' && error !== null && 'pageIndex' in error && typeof error.pageIndex === 'number' ? { pageIndex: error.pageIndex } : {}),
    }
  }
}

export function finishedPaginateResult(front: PaginateBookResult, body: PaginateBookResult, input: PaginateBookInput): PaginateBookResult {
  const pages = [...front.pages, ...body.pages]
  if (body.refusals.length > 0) return { pages, refusals: body.refusals }
  if (front.refusals.length > 0) return { pages, refusals: front.refusals }
  const finished = finishedPlanParentResult(pages, input.flows, input.parents, input.geometryParents)
  if ('refusal' in finished) return { pages, refusals: [{ flow: pages[finished.pageIndex ?? 0]?.flow ?? 'document', message: finished.refusal }] }
  for (const [index, parent] of finished.parents.entries()) if (pages[index]) pages[index].parent = parent
  return { pages, refusals: [] }
}
