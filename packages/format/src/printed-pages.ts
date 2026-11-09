import { z } from 'zod'
import { BookOpens } from './book-opens.ts'
import { SectionNumbering } from './folio.ts'
import { HeadTemplates } from './head-template.ts'
import { type LogicalMargin, RequiredLogicalMargin } from './margins.ts'
import { NumberSystem } from './numbering.ts'
import { BOOK_PARENT_NAMES, parentRuleIssues, parentRules, renamedParentRulesFieldIssue } from './parent-rules.ts'
import { RecordFacts, RecordValues } from './record-facts.ts'
import { CONTINUE_OPENS_REMEDY } from './section-opens-policy.ts'
import { Variables } from './variable.ts'

export const Fragmentation = z.enum(['safe', 'none'])
export type Fragmentation = z.infer<typeof Fragmentation>

export const ParentPage = z.object({
  name: z.string().min(1),
  basedOn: z.string().min(1).optional(),
  margin: RequiredLogicalMargin.optional(),
  head: z.string().optional(),
  foot: z.string().optional(),
})

export const PrintedPages = z.object({
  variables: Variables,
  headTemplates: HeadTemplates,
  parents: z.array(ParentPage).min(1),
  parentRules,
  rules: z.unknown().optional(),
  numbering: NumberSystem.optional(),
  fragmentation: Fragmentation.default('safe'),
  sections: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        opens: BookOpens.optional(),
        numbering: SectionNumbering.optional(),
        parentRules: parentRules.optional(),
        parents: z.unknown().optional(),
        html: z.string(),
        values: RecordValues.optional(),
        record: RecordFacts.optional(),
        recordTemplate: z.object({ name: z.string(), slots: z.array(z.object({ key: z.string() })) }).optional(),
      }),
    )
    .min(1)
    .superRefine((sections, ctx) => {
      if (sections[0]?.opens !== 'continue') return
      ctx.addIssue({
        code: 'custom',
        path: [0, 'opens'],
        message: `The first printed section opens with continue but has no preceding flow; ${CONTINUE_OPENS_REMEDY}.`,
      })
    })
    .optional(),
})

export type ParentPage = z.infer<typeof ParentPage>
export type PrintedPages = z.infer<typeof PrintedPages>

export { BOOK_PARENT_NAMES } from './parent-rules.ts'

export function bookParentPages(margin: LogicalMargin): ParentPage[] {
  const held = () => ({ ...margin })
  const placement = (name: string, className: string) => `<div class="${className}" data-motif="segnavia:head-template" data-motif-name="${name}"></div>`
  const head = placement('segnavia:running-head', 'segnavia-running-head')
  const foot = placement('segnavia:folio', 'segnavia-folio')
  return [
    { name: BOOK_PARENT_NAMES.recto, margin: held(), head, foot },
    { name: BOOK_PARENT_NAMES.verso, margin: held(), head, foot },
    { name: BOOK_PARENT_NAMES.opener, margin: held(), foot },
    { name: BOOK_PARENT_NAMES.blank, margin: held() },
  ]
}

export interface ResolvedParentPage {
  name: string
  margin: LogicalMargin
  head: string
  foot: string
}

export interface TextArea {
  width: number
  height: number
}

export function textArea(parent: Pick<ResolvedParentPage, 'margin'>, paper: { width: number; height: number }): TextArea {
  return {
    width: paper.width - parent.margin.inlineStart - parent.margin.inlineEnd,
    height: paper.height - parent.margin.blockStart - parent.margin.blockEnd,
  }
}

const ZERO_PARENT_MARGIN: LogicalMargin = { blockStart: 0, blockEnd: 0, inlineStart: 0, inlineEnd: 0 }

export function resolveParentPages(parents: ParentPage[]): ResolvedParentPage[] {
  const source = new Map(parents.map((parent) => [parent.name, parent]))
  const resolved = new Map<string, ResolvedParentPage>()
  const resolve = (parent: ParentPage): ResolvedParentPage => {
    const held = resolved.get(parent.name)
    if (held) return held
    const baseParent = parent.basedOn ? source.get(parent.basedOn) : undefined
    const base = baseParent ? resolve(baseParent) : undefined
    const result = {
      name: parent.name,
      margin: parent.margin ?? base?.margin ?? ZERO_PARENT_MARGIN,
      head: parent.head ?? base?.head ?? '',
      foot: parent.foot ?? base?.foot ?? '',
    }
    resolved.set(parent.name, result)
    return result
  }
  return parents.map(resolve)
}

export function parentListIssues(
  parents: ParentPage[],
  options: { path?: (string | number)[]; known?: Iterable<string> } = {},
): Array<{ path: (string | number)[]; message: string }> {
  const issues: Array<{ path: (string | number)[]; message: string }> = []
  const root = options.path ?? ['parents']
  const listed = new Map<string, ParentPage>()
  const known = new Set<string>([...(options.known ?? [])])
  parents.forEach((parent, index) => {
    if (parent.name.startsWith('segnavia:')) {
      issues.push({
        path: [...root, index, 'name'],
        message: `host parent page "${parent.name}" cannot use the built-in segnavia: namespace; give it a new name, set basedOn to "${parent.name}", and select the new name with parentRules to clear this refusal`,
      })
    }
    if (listed.has(parent.name))
      issues.push({
        path: [...root, index, 'name'],
        message: `parent page "${parent.name}" is duplicated; give every parent page a unique name to clear this refusal`,
      })
    listed.set(parent.name, parent)
    known.add(parent.name)
  })
  parents.forEach((parent, index) => {
    if (parent.basedOn && !known.has(parent.basedOn)) {
      issues.push({
        path: [...root, index, 'basedOn'],
        message: `parent page "${parent.name}" is based on unknown parent page "${parent.basedOn}"; add that parent page or remove basedOn to clear this refusal`,
      })
    }
    const chain: string[] = []
    let cursor: ParentPage | undefined = parent
    while (cursor) {
      if (chain.includes(cursor.name)) {
        issues.push({
          path: [...root, index, 'basedOn'],
          message: `parent page inheritance has a cycle ${[...chain, cursor.name].join(' -> ')}; remove a basedOn link to clear this refusal`,
        })
        break
      }
      chain.push(cursor.name)
      cursor = cursor.basedOn ? listed.get(cursor.basedOn) : undefined
    }
  })
  return issues
}

export function printedPagesIssues(value: PrintedPages): Array<{ path: (string | number)[]; message: string }> {
  const issues = parentListIssues(value.parents)
  const names = new Set(value.parents.map((parent) => parent.name))
  issues.push(...parentRuleIssues(value.parentRules, names))
  if (value.rules !== undefined) {
    issues.push(renamedParentRulesFieldIssue('printed field rules', ['rules']))
  }
  value.sections?.forEach((section, index) => {
    if (section.parentRules) issues.push(...parentRuleIssues(section.parentRules, names, ['sections', index, 'parentRules']))
    if (section.parents !== undefined) {
      issues.push(renamedParentRulesFieldIssue('printed section field parents', ['sections', index, 'parents']))
    }
  })
  return issues
}

export function pagePrintedPagesIssues(page: {
  scripts: 'refuse' | 'sandboxed'
  print?: { margin?: unknown; bleed: number; marks: boolean }
  printedPages?: PrintedPages
}): Array<{ path: (string | number)[]; message: string }> {
  if (!page.printedPages) return []
  const issues = printedPagesIssues(page.printedPages).map((issue) => ({ ...issue, path: ['printedPages', ...issue.path] }))
  if (!page.print) issues.push({ path: ['print'], message: 'printedPages could not establish a paper; add print.paper to clear this refusal' })
  if (page.scripts !== 'refuse') {
    issues.push({ path: ['scripts'], message: 'printedPages could not establish deterministic cloned content; set scripts to "refuse" to clear this refusal' })
  }
  if (page.print?.margin)
    issues.push({ path: ['print', 'margin'], message: 'printedPages and print.margin both own the margins; remove print.margin to clear this refusal' })
  return issues
}
