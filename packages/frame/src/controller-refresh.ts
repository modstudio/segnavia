import type { Slide } from '@segnavia/format'
import type { ResolvedContent } from './controller-types.ts'
import { SlideRefusedError } from './deck-refusal.ts'
import { dispatchElementError } from './element-error.ts'

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
    const refusal = new SlideRefusedError(index, slide.id, error)
    dispatchElementError(errors, refusal)
    return 'failed'
  }
  if (!navigationIsCurrent()) return 'superseded'
  const newer = supersedingRefresh()
  if (newer !== undefined) return newer ?? 'superseded'
  commit(content)
  return 'refreshed'
}
