import { boundComposeProgress, type ComposeProgress } from '@segnavia/format'

export const RENDER_PROGRESS_BINDING = '__segnaviaComposeProgress'
export const RENDER_PROGRESS_LIMIT = 10_000
export const RENDER_PROGRESS_INPUT_LIMIT = 9_999

export type RenderStage = 'compose' | 'set' | 'impose' | 'finish'

export interface RenderProgress {
  stage: RenderStage
  stages: readonly RenderStage[]
  done: number
  total: number
  input?: number
}

export interface RenderProgressOptions {
  report(progress: RenderProgress): void
}

export interface RenderStageFacts {
  compose?: boolean
  set?: boolean
  impose?: boolean
  finish?: boolean
}

const ORDER: readonly RenderStage[] = ['compose', 'set', 'impose', 'finish']

export function renderProgressStages(facts: RenderStageFacts): RenderStage[] {
  return ORDER.filter((stage) => facts[stage])
}

export function boundRenderProgress(value: unknown): RenderProgress | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const { stage, stages, done, total, input } = value as Partial<RenderProgress>
  if (!ORDER.includes(stage as RenderStage) || !Array.isArray(stages) || stages.length > ORDER.length) return undefined
  if (new Set(stages).size !== stages.length || stages.some((item) => !ORDER.includes(item))) return undefined
  if (!Number.isInteger(done) || (done as number) < 0 || (done as number) > RENDER_PROGRESS_LIMIT) return undefined
  if (!Number.isInteger(total) || (total as number) < 0 || (total as number) > RENDER_PROGRESS_LIMIT || (done as number) > (total as number)) return undefined
  if (input !== undefined && (!Number.isInteger(input) || input < 0 || input > RENDER_PROGRESS_INPUT_LIMIT)) return undefined
  return { stage: stage as RenderStage, stages: [...stages], done: done as number, total: total as number, ...(input === undefined ? {} : { input }) }
}

export interface RenderProgressReporter {
  readonly enabled: boolean
  readonly stages: readonly RenderStage[]
  report(stage: RenderStage, done: number, total: number, input?: number): void
}

export function renderProgressReporter(progress: RenderProgressOptions | undefined, stages: readonly RenderStage[]): RenderProgressReporter {
  const highWater = new Map<string, Pick<RenderProgress, 'done' | 'total'>>()
  return {
    enabled: Boolean(progress),
    stages: [...stages],
    report(stage, done, total, input) {
      if (!progress || !stages.includes(stage)) return
      const bounded = boundRenderProgress({ stage, stages, done, total, ...(input === undefined ? {} : { input }) })
      if (!bounded) return
      const mark = `${stage}:${input ?? ''}`
      const high = highWater.get(mark)
      if (high && bounded.total === high.total && bounded.done <= high.done) return
      if (high && bounded.total !== high.total && bounded.done <= Math.min(high.done, bounded.total) && bounded.done !== bounded.total) return
      highWater.set(mark, bounded)
      progress.report(bounded)
    },
  }
}

export function composeProgressReport(reporter: RenderProgressReporter, input?: number): ((progress: ComposeProgress) => void) | undefined {
  return reporter.enabled ? ({ pages, total }) => reporter.report('compose', pages, total, input) : undefined
}

export function renderProgressDocumentOptions(progress: RenderProgressOptions | undefined): { progress: boolean; progressCallback?: string } {
  return progress ? { progress: true, progressCallback: RENDER_PROGRESS_BINDING } : { progress: false }
}

export function reportRenderProgress(value: unknown, report: ((progress: ComposeProgress) => void) | undefined): void {
  const progress = boundComposeProgress(value)
  if (progress) report?.(progress)
}
