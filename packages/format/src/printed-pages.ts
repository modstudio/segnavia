import { z } from 'zod'
import { NumberSystem } from './numbering.ts'

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
    const unknown = Object.keys(rules).filter((key) => !['every', 'first', 'recto', 'verso', 'last'].includes(key))
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

export function printedPagesIssues(value: PrintedPages): Array<{ path: (string | number)[]; message: string }> {
  const issues: Array<{ path: (string | number)[]; message: string }> = []
  const parents = new Map<string, ParentPage>()
  value.parents.forEach((parent, index) => {
    if (parents.has(parent.name))
      issues.push({
        path: ['parents', index, 'name'],
        message: `parent page "${parent.name}" is duplicated; give every parent page a unique name to clear this refusal`,
      })
    parents.set(parent.name, parent)
  })
  for (const [role, name] of Object.entries(value.rules)) {
    if (name === undefined) continue
    if (!parents.has(name))
      issues.push({
        path: ['rules', role],
        message: `${role} names unknown parent page "${name}"; add that parent page or name an existing one to clear this refusal`,
      })
  }
  value.parents.forEach((parent, index) => {
    if (parent.basedOn && !parents.has(parent.basedOn)) {
      issues.push({
        path: ['parents', index, 'basedOn'],
        message: `parent page "${parent.name}" is based on unknown parent page "${parent.basedOn}"; add that parent page or remove basedOn to clear this refusal`,
      })
    }
    const path: string[] = []
    let cursor: ParentPage | undefined = parent
    while (cursor) {
      if (path.includes(cursor.name)) {
        issues.push({
          path: ['parents', index, 'basedOn'],
          message: `parent page inheritance has a cycle ${[...path, cursor.name].join(' -> ')}; remove a basedOn link to clear this refusal`,
        })
        break
      }
      path.push(cursor.name)
      cursor = cursor.basedOn ? parents.get(cursor.basedOn) : undefined
    }
  })
  return issues
}
