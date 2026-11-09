import { z } from 'zod'
import { DEFAULT_LIMITS, type Limits } from './limits.ts'

export const PaginateWindow = z.object({
  flow: z.string(),
  start: z.number(),
  end: z.number(),
  top: z.number(),
  column: z.number(),
  columns: z.number(),
})
export type PaginateWindow = z.infer<typeof PaginateWindow>

export const PaginatePageNote = z.object({
  id: z.string(),
  series: z.string(),
  whole: z.boolean(),
  start: z.number(),
  end: z.number(),
})
export type PaginatePageNote = z.infer<typeof PaginatePageNote>

export const PaginatePageMarks = z.record(z.string(), z.object({ first: z.string(), last: z.string(), scope: z.literal('flow').optional() }))
export type PaginatePageMarks = z.infer<typeof PaginatePageMarks>

const PlanPageStart = z.object({
  flow: z.string(),
  block: z.number().int().nonnegative('start.block must be a non-negative integer; compute a new plan to clear this refusal'),
  line: z.number().int().nonnegative('start.line must be a non-negative integer; compute a new plan to clear this refusal'),
  id: z.string().optional(),
})

export const PlanPage = z
  .object({
    kind: z.enum(['front', 'body', 'blank']),
    number: z.number(),
    sequence: z.enum(['front', 'body']),
    flow: z.string(),
    role: z.enum(['opener', 'body', 'blank', 'fixed']),
    windows: z.array(PaginateWindow),
    notes: z.array(PaginatePageNote),
    headerRepeat: z.number().optional(),
    blank: z.boolean(),
    sectionOpening: z.boolean(),
    runningHead: z.string().optional(),
    parts: z.record(z.string(), z.string()).optional(),
    marks: PaginatePageMarks.optional(),
    parent: z.string(),
    face: z.enum(['recto', 'verso']),
    side: z.enum(['left', 'right']),
    start: PlanPageStart.optional(),
    fingerprint: z.string(),
  })
  .superRefine((page, ctx) => {
    page.windows.forEach((window, index) => {
      if (window.start > window.end) {
        ctx.addIssue({
          code: 'custom',
          path: ['windows', index, 'end'],
          message: 'window end is before its start; compute a new plan to clear this refusal',
        })
      }
    })
  })
export type PlanPage = z.infer<typeof PlanPage>

const PlanShape = z.object({
  version: z.literal(1, { error: 'version must be 1; compute a new plan to clear this refusal' }),
  fingerprint: z.string(),
  breaks: z.array(z.string()),
  pages: z.array(PlanPage),
  folios: z.array(z.string().nullable()),
  total: z.string(),
})

export interface PlanParseOptions {
  limits?: Pick<Limits, 'pages'>
}

function planSchema(options?: PlanParseOptions) {
  const pageLimit = options?.limits?.pages ?? DEFAULT_LIMITS.pages
  return PlanShape.superRefine((plan, ctx) => {
    if (plan.pages.length > pageLimit) {
      ctx.addIssue({
        code: 'custom',
        path: ['pages'],
        message: `pages has ${plan.pages.length} entries, above the limits.pages limit of ${pageLimit}; reduce the pages or raise limits.pages to clear this refusal`,
      })
    }
    if (plan.folios.length !== plan.pages.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['folios'],
        message: `folios has ${plan.folios.length} entries but pages has ${plan.pages.length}; compute a new plan to clear this refusal`,
      })
    }
  })
}

export type Plan = z.infer<typeof PlanShape>

const defaultSchema = planSchema()
type PlanSchema = Omit<typeof defaultSchema, 'parse' | 'safeParse'> & {
  parse(input: unknown, options?: PlanParseOptions): Plan
  safeParse(input: unknown, options?: PlanParseOptions): { success: true; data: Plan } | { success: false; error: unknown }
}

export const Plan = Object.assign(defaultSchema, {
  parse(input: unknown, options?: PlanParseOptions): Plan {
    const result = planSchema(options).safeParse(input)
    if (result.success) return result.data
    const issue = result.error.issues[0]
    const path = issue?.path.join('.') || 'plan'
    throw new Error(`${path}: ${issue?.message ?? 'the saved plan is invalid; compute a new plan to clear this refusal'}`)
  },
  safeParse(input: unknown, options?: PlanParseOptions) {
    return planSchema(options).safeParse(input)
  },
}) as PlanSchema
