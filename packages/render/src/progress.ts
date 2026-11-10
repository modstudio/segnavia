import { boundComposeProgress, type ComposeProgress } from '@segnavia/format'

export const RENDER_PROGRESS_BINDING = '__segnaviaComposeProgress'

export interface RenderProgressOptions {
  report(progress: ComposeProgress): void
}

export function renderProgressDocumentOptions(progress: RenderProgressOptions | undefined): { progress: boolean; progressCallback?: string } {
  return progress ? { progress: true, progressCallback: RENDER_PROGRESS_BINDING } : { progress: false }
}

export function reportRenderProgress(value: unknown, report: ((progress: ComposeProgress) => void) | undefined): void {
  const progress = boundComposeProgress(value)
  if (progress) report?.(progress)
}
