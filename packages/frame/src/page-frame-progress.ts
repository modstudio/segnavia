import { dispatchComposeProgress, MESSAGE } from './bridge.ts'
import type { FrameMessage } from './bridge-message.ts'
import { type PageFrameIdentity, samePageFrame } from './page-frame.ts'

export function dispatchCurrentPageProgress(
  target: EventTarget,
  message: FrameMessage | null,
  current: PageFrameIdentity,
  composed: PageFrameIdentity | undefined,
  slots: PageFrameIdentity | undefined,
): boolean {
  if (message?.type !== MESSAGE.composeProgress) return false
  if (samePageFrame(current, composed) || samePageFrame(current, slots)) dispatchComposeProgress(target, message)
  return true
}
