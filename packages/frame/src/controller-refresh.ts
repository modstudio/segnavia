import type { Slide } from '@segnavia/format'
import type { ResolvedContent } from './controller-types.ts'

export type ContentRefreshResult = 'refreshed' | 'superseded' | 'failed'

export async function refreshControllerContent(
  index: number,
  slide: Slide,
  resolve: (slide: Slide, index: number) => Promise<ResolvedContent>,
  navigationIsCurrent: () => boolean,
  supersedingRefresh: () => Promise<ContentRefreshResult> | null | undefined,
  commit: (content: ResolvedContent) => void,
  errors: EventTarget,
): Promise<ContentRefreshResult> {
  let content: ResolvedContent
  try {
    content = await resolve(slide, index)
  } catch (error) {
    if (!navigationIsCurrent()) return 'superseded'
    const newer = supersedingRefresh()
    if (newer !== undefined) return newer ?? 'superseded'
    const message = error instanceof Error ? error.message : String(error)
    errors.dispatchEvent(new CustomEvent('error', { detail: { index, message } }))
    return 'failed'
  }
  if (!navigationIsCurrent()) return 'superseded'
  const newer = supersedingRefresh()
  if (newer !== undefined) return newer ?? 'superseded'
  commit(content)
  return 'refreshed'
}
