import { MESSAGE } from './bridge.ts'
import type { DeckState, ResolvedContent } from './controller.ts'

export function postFrameCue(frame: HTMLIFrameElement, content: ResolvedContent, shown: DeckState['shown']): boolean {
  if (content.kind !== 'url' || content.bridge !== true) return false
  frame.contentWindow?.postMessage({ type: MESSAGE.cue, annotations: shown }, '*')
  return true
}

export function postStageCue(
  pool: { frameForSlide?(slideId: string): HTMLIFrameElement | null },
  sent: WeakMap<HTMLIFrameElement, string> | undefined,
  state: DeckState,
  force = false,
) {
  const slideId = state.slide?.id
  if (!slideId || !state.content || !sent) return
  const frame = pool.frameForSlide?.(slideId)
  if (!frame) return
  const key = state.shown === null ? 'all' : state.shown.join(',')
  if (!force && sent.get(frame) === key) return
  if (postFrameCue(frame, state.content, state.shown)) sent.set(frame, key)
}
