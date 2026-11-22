import { LimitExceededError, Plan, type ResolvedLimits, type Plan as SavedPlan } from '@segnavia/format'
import { RenderLimitError, RenderRefusedError } from './errors.ts'

export function parseBookRenderPlan(input: unknown, limits: Pick<ResolvedLimits, 'pages' | 'pagesSource'>): SavedPlan {
  try {
    return Plan.parse(input, { limits })
  } catch (error) {
    if (error instanceof LimitExceededError) {
      const exceeded = error.exceeded[0]
      if (exceeded) throw new RenderLimitError('pages', exceeded.actual, limits.pages, { pagesSource: limits.pagesSource })
    }
    throw new RenderRefusedError(error instanceof Error ? error.message : String(error))
  }
}
