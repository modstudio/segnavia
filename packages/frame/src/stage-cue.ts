import { MESSAGE } from './bridge.ts'
import type { DeckState, ResolvedContent } from './controller.ts'
import { cueKey } from './cue-key.ts'

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
  const key = cueKey(state.shown)
  if (!force && sent.get(frame) === key) return
  if (postFrameCue(frame, state.content, state.shown)) sent.set(frame, key)
}

function postReplayedStageCue(
  pool: { frameForSlide?(slideId: string): HTMLIFrameElement | null },
  sent: WeakMap<HTMLIFrameElement, string> | undefined,
  state: DeckState | undefined,
  slideId: string,
): DeckState | undefined {
  if (state?.slide?.id === slideId) postStageCue(pool, sent, state, true)
  return state
}

export const postLoadedStageCue = postReplayedStageCue
export const postReadyStageCue = postReplayedStageCue
