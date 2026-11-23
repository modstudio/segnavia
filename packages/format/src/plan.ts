import { z } from 'zod'
import { DEFAULT_LIMITS, LimitExceededError, type Limits, type PageLimitSource } from './limits.ts'

export const PLAN_VERSION = 9 as const

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
    variables: z.record(z.string(), z.string()).default({}),
    parent: z.string(),
    pageGeometry: z.string().optional(),
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
  version: z.literal(PLAN_VERSION, { error: `version must be ${PLAN_VERSION}; compute a new plan to clear this refusal` }),
  fingerprint: z.string(),
  breaks: z.array(z.string()),
  pages: z.array(PlanPage),
  folios: z.array(z.string().nullable()),
  folioPrints: z.array(z.boolean().nullable()),
  numberingTotals: z.array(z.string()),
  total: z.string(),
  documentFolios: z.array(z.string().nullable()),
  documentTotal: z.string(),
  recordTotals: z.record(z.string(), z.string()),
  records: z.record(z.string(), z.object({ index: z.string(), count: z.string() })),
})

export interface PlanParseOptions {
  limits?: Pick<Limits, 'pages'> & { pagesSource?: PageLimitSource }
}

function structurallyConsistentPlan(plan: z.infer<typeof PlanShape>, ctx: z.RefinementCtx): void {
  if (plan.folios.length !== plan.pages.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['folios'],
      message: `folios has ${plan.folios.length} entries but pages has ${plan.pages.length}; compute a new plan to clear this refusal`,
    })
  }
  if (plan.folioPrints.length !== plan.pages.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['folioPrints'],
      message: `folioPrints has ${plan.folioPrints.length} entries but pages has ${plan.pages.length}; compute a new plan to clear this refusal`,
    })
  }
  if (plan.numberingTotals.length !== plan.pages.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['numberingTotals'],
      message: `numberingTotals has ${plan.numberingTotals.length} entries but pages has ${plan.pages.length}; compute a new plan to clear this refusal`,
    })
  }
  if (plan.documentFolios.length !== plan.pages.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['documentFolios'],
      message: `documentFolios has ${plan.documentFolios.length} entries but pages has ${plan.pages.length}; compute a new plan to clear this refusal`,
    })
  }
}

function planStructure() {
  return PlanShape.superRefine(structurallyConsistentPlan)
}

// Plan replaces parse and safeParse on its own schema instance, so the checks below use a separate one.
const PlanStructure = planStructure()

export type Plan = z.infer<typeof PlanShape>

type PlanSchema = Omit<ReturnType<typeof planStructure>, 'parse' | 'safeParse'> & {
  parse(input: unknown, options?: PlanParseOptions): Plan
  parseStructure(input: unknown): Plan
  safeParse(input: unknown, options?: PlanParseOptions): { success: true; data: Plan } | { success: false; error: unknown }
}

function pageExcess(plan: Plan, options?: PlanParseOptions): LimitExceededError | undefined {
  const limit = options?.limits?.pages ?? DEFAULT_LIMITS.pages
  if (plan.pages.length <= limit) return undefined
  return new LimitExceededError('pages', plan.pages.length, limit, { pagesSource: options?.limits?.pagesSource })
}

function parsedPlanStructure(input: unknown): Plan {
  const result = PlanStructure.safeParse(input)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const path = issue?.path.join('.') || 'plan'
  throw new Error(`${path}: ${issue?.message ?? 'the saved plan is invalid; compute a new plan to clear this refusal'}`)
}

export const Plan = Object.assign(planStructure(), {
  parse(input: unknown, options?: PlanParseOptions): Plan {
    const plan = parsedPlanStructure(input)
    const excess = pageExcess(plan, options)
    if (excess) throw excess
    return plan
  },
  parseStructure(input: unknown): Plan {
    return parsedPlanStructure(input)
  },
  safeParse(input: unknown, options?: PlanParseOptions) {
    const result = PlanStructure.safeParse(input)
    if (!result.success) return result
    const excess = pageExcess(result.data, options)
    return excess ? { success: false as const, error: excess } : result
  },
}) as PlanSchema
