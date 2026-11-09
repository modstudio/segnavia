import type { ParentRules, TextDirection } from '@segnavia/format'
import type { ParentFacts } from '@segnavia/layout'

interface PrintedPlanPage {
  flow: string
  parent: string
  face: 'recto' | 'verso'
  side: 'left' | 'right'
  blank: boolean
}

export function applyPrintedParentRules<T extends { pages: PrintedPlanPage[] }>(
  plan: T,
  rulesByFlow: Readonly<Record<string, ParentRules>>,
  documentRules: ParentRules,
  direction: TextDirection,
  faceOf: (index: number, direction: TextDirection) => { face: 'recto' | 'verso'; side: 'left' | 'right' },
  select: (rules: ParentRules, facts: ParentFacts) => string,
): T {
  plan.pages.forEach((page, offset) => {
    const index = offset + 1
    const physical = faceOf(index, direction)
    const rules = rulesByFlow[page.flow] ?? documentRules
    page.parent = select(rules, {
      documentFirst: index === 1,
      documentLast: index === plan.pages.length,
      sectionFirst: offset === 0 || plan.pages[offset - 1]?.flow !== page.flow,
      sectionLast: offset === plan.pages.length - 1 || plan.pages[offset + 1]?.flow !== page.flow,
      face: physical.face,
      blank: page.blank,
    })
    page.face = physical.face
    page.side = physical.side
  })
  return plan
}
