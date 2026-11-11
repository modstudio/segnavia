import type { Page, PreflightProfile } from '@segnavia/format'
import { dispatchFontFailures, dispatchPreflight, MESSAGE, messageFrom } from './bridge.ts'
import type { PageFrameHeightState } from './page-element-layout.ts'
import { dispatchPageFailure } from './page-failure.ts'
import { type PageFrameIdentity, samePageFrame } from './page-frame.ts'
import { dispatchCurrentPageProgress } from './page-frame-progress.ts'
import { printedPageComposeFailure } from './page-printed.ts'
import type { PreparedSlots } from './slot-render.ts'

// These fields are captured when the message arrives. This is safe because every
// branch after an event dispatch is gated on a different message type.
export interface PageFrameMessageState {
  composedFrame: PageFrameIdentity | undefined
  currentFrame: PageFrameIdentity
  documentIsFinal: boolean
  documentIsLoaded: boolean
  frameHeight: PageFrameHeightState
  frameReady: boolean
  page: Page | null
  profile: PreflightProfile
  resolvedSlots: PreparedSlots | undefined
  slotFrame: PageFrameIdentity | undefined
  fit(): void
  ready(): void
}

export function handlePageFrameMessage(target: HTMLElement, event: MessageEvent, state: PageFrameMessageState): void {
  const message = messageFrom(event, state.currentFrame.frame, state.profile)
  dispatchFontFailures(target, message)
  if (dispatchCurrentPageProgress(target, message, state.currentFrame, state.composedFrame, state.slotFrame)) return
  if (message?.type === MESSAGE.ready && state.documentIsLoaded && !state.frameReady) {
    state.ready()
    if (state.documentIsFinal) target.dispatchEvent(new Event('ready'))
  }
  if (dispatchPreflight(target, message)) return
  const composeFailure = printedPageComposeFailure(message, MESSAGE.composeFailure, state.currentFrame, state.composedFrame)
  if (composeFailure) {
    dispatchPageFailure(target, composeFailure, true)
    return
  }
  if (message?.type === MESSAGE.slotFit && message.slots && samePageFrame(state.currentFrame, state.slotFrame)) state.resolvedSlots?.mergeFit(message.slots)
  if (!state.page || message?.type !== MESSAGE.height || message.height === undefined) return
  if (state.page.printedPages) {
    if (!samePageFrame(state.currentFrame, state.composedFrame)) return
  } else if (typeof state.page.size === 'object' && state.page.size.height !== 'auto') {
    // A fixed sheet keeps its own height whatever its content reports.
    return
  }
  state.frameHeight.contentHeight = message.height
  state.frameHeight.hasReport = true
  target.dataset.measured = ''
  state.fit()
}
