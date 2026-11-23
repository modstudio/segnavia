import type { FontFailure } from '@segnavia/format'
import { MESSAGE, messageFrom } from './bridge.ts'
import type { DeckController } from './controller.ts'
import type { FramePool } from './frame-pool.ts'
import { LAYOUT_FRAME_ATTRIBUTE } from './layout.ts'
import type { PreparedSlots } from './slot-render.ts'
import { dispatchSoundPlay } from './sound-play.ts'
import { surfacePreflightFor } from './surface-preflight.ts'

export function handleStageMessage(
  target: HTMLElement,
  pool: Pick<FramePool, 'frames' | 'markReady' | 'activeFrame' | 'slideIdFor' | 'contentFor'>,
  resolvedSlots: PreparedSlots | undefined,
  controller: DeckController | null,
  refuse: (slideId: string, cause: unknown) => void,
  ready: (slideId: string) => void,
  event: MessageEvent,
  reportFontFailures: (failures: FontFailure[]) => void = () => {},
) {
  const message = messageFrom(event, pool.frames(), surfacePreflightFor(target).resolvedProfile())
  const content = pool.contentFor(event.source)
  dispatchSoundPlay(target, message, content?.kind === 'html' ? content.sounds : undefined)
  if (message?.type === MESSAGE.fontFailures && message.failures) reportFontFailures(message.failures)
  if (message?.type === MESSAGE.preflight && message.report && surfacePreflightFor(target).enabled) {
    const slideId = pool.slideIdFor(event.source)
    if (slideId) surfacePreflightFor(target).receive(slideId, message.report)
  }
  if (message?.type === MESSAGE.ready) {
    const slideId = pool.slideIdFor(event.source)
    pool.markReady(event.source)
    if (slideId) ready(slideId)
  }
  const failedFrame = message?.type === MESSAGE.composeFailure && message.text ? pool.frames().find((frame) => frame.contentWindow === event.source) : undefined
  if (failedFrame?.hasAttribute(LAYOUT_FRAME_ATTRIBUTE)) {
    const slideId = pool.slideIdFor(event.source)
    if (slideId) refuse(slideId, new Error(message?.text ?? ''))
  }
  if (message?.type === MESSAGE.slotFit && message.slots) resolvedSlots?.mergeFit(message.slots)
  if (message?.type === MESSAGE.key && message.key && event.source === pool.activeFrame()?.contentWindow) controller?.key(message.key)
}
