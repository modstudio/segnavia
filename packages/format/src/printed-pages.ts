import { z } from 'zod'
import { BOOK_FURNITURE } from './motif.ts'
import { NumberSystem } from './numbering.ts'

export const PRINTED_PAGE_LIMIT = 500
export const PRINTED_PAGE_ROLES = ['every', 'first', 'recto', 'verso', 'last'] as const
export type PrintedPageRole = (typeof PRINTED_PAGE_ROLES)[number]

export const ParentPageMargin = z.object({
  top: z.number().nonnegative(),
  bottom: z.number().nonnegative(),
  inner: z.number().nonnegative(),
  outer: z.number().nonnegative(),
})

export const ParentPage = z.object({
  name: z.string().min(1),
  basedOn: z.string().min(1).optional(),
  margin: ParentPageMargin.optional(),
  head: z.string().optional(),
  foot: z.string().optional(),
})

const ParentName = z.string().min(1)

export const PrintedPageRules = z
  .object({
    every: z.string({ error: 'every is required; name the default parent page to clear this refusal' }).min(1),
    first: ParentName.optional(),
    recto: ParentName.optional(),
    verso: ParentName.optional(),
    last: ParentName.optional(),
  })
  .passthrough()
  .superRefine((rules, ctx) => {
    const unknown = Object.keys(rules).filter((key) => !PRINTED_PAGE_ROLES.includes(key as PrintedPageRole))
    if (unknown.length) {
      ctx.addIssue({
        code: 'custom',
        message: `unknown printed-page role ${unknown.map((key) => JSON.stringify(key)).join(', ')}; use only every, first, recto, verso or last to clear this refusal`,
      })
    }
  })
  .transform(({ every, first, recto, verso, last }) => ({
    every,
    ...(first === undefined ? {} : { first }),
    ...(recto === undefined ? {} : { recto }),
    ...(verso === undefined ? {} : { verso }),
    ...(last === undefined ? {} : { last }),
  }))

export const PrintedPages = z.object({
  parents: z.array(ParentPage).min(1),
  rules: PrintedPageRules,
  numbering: NumberSystem.optional(),
})

export type ParentPageMargin = z.infer<typeof ParentPageMargin>
export type ParentPage = z.infer<typeof ParentPage>
export type PrintedPageRules = z.infer<typeof PrintedPageRules>
export type PrintedPages = z.infer<typeof PrintedPages>

export const BOOK_PARENT_NAMES = {
  recto: 'segnavia:recto',
  verso: 'segnavia:verso',
  opener: 'segnavia:opener',
  blank: 'segnavia:blank',
} as const

export interface FlowingParentNames {
  opener: string
  recto: string
  verso: string
}

export function flowingParentNames(parents?: Partial<FlowingParentNames>): FlowingParentNames {
  return {
    opener: parents?.opener ?? 'segnavia:opener',
    recto: parents?.recto ?? 'segnavia:recto',
    verso: parents?.verso ?? 'segnavia:verso',
  }
}

function furniture(region: 'head' | 'foot'): string {
  return BOOK_FURNITURE.filter((item) => item.region === region)
    .filter((item) => item.fields.every((field) => !('required' in field) || !field.required))
    .map((item) => `<div class="${item.className}" data-motif="${item.key}"></div>`)
    .join('')
}

export function bookParentPages(margin: ParentPageMargin): ParentPage[] {
  const held = () => ({ ...margin })
  const head = furniture('head')
  const foot = furniture('foot')
  return [
    { name: BOOK_PARENT_NAMES.recto, margin: held(), head, foot },
    { name: BOOK_PARENT_NAMES.verso, margin: held(), head, foot },
    { name: BOOK_PARENT_NAMES.opener, margin: held(), foot },
    { name: BOOK_PARENT_NAMES.blank, margin: held() },
  ]
}

export interface ResolvedParentPage {
  name: string
  margin: ParentPageMargin
  head: string
  foot: string
}

export interface TextArea {
  width: number
  height: number
}

export function textArea(parent: Pick<ResolvedParentPage, 'margin'>, paper: { width: number; height: number }): TextArea {
  return {
    width: paper.width - parent.margin.inner - parent.margin.outer,
    height: paper.height - parent.margin.top - parent.margin.bottom,
  }
}

const ZERO_PARENT_MARGIN: ParentPageMargin = { top: 0, bottom: 0, inner: 0, outer: 0 }

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
  for (const [role, name] of Object.entries(value.rules)) {
    if (name === undefined) continue
    if (!names.has(name))
      issues.push({
        path: ['rules', role],
        message: `${role} names unknown parent page "${name}"; add that parent page or name an existing one to clear this refusal`,
      })
  }
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
  if (page.print && (page.print.bleed > 0 || page.print.marks)) {
    issues.push({
      path: ['print'],
      message: 'printedPages could not establish one composed paper with bleed or marks; remove bleed and marks to clear this refusal',
    })
  }
  return issues
}
