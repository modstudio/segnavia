import { boundComposeProgress, type ComposeProgress } from '@segnavia/format'

export const RENDER_PROGRESS_BINDING = '__segnaviaComposeProgress'

export function reportRenderProgress(value: unknown, report: ((progress: Required<ComposeProgress>) => void) | undefined): void {
  const progress = boundComposeProgress(value)
  if (!progress || progress.total === undefined) return
  report?.({ pages: progress.pages, total: progress.total })
}
