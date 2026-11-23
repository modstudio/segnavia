import type { RenderProgressReporter } from './progress.ts'

export function pagesPdfCopyProgress(reporter: RenderProgressReporter, copy: number, copies: number): RenderProgressReporter {
  return {
    enabled: reporter.enabled,
    stages: reporter.stages,
    report(stage, done, total, input) {
      if ((stage === 'compose' || stage === 'set') && input !== undefined) {
        reporter.report(stage, copy * total + done, copies * total, input)
        return
      }
      reporter.report(stage, done, total, input)
    },
  }
}
