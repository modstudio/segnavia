import type { Page, PreflightProfile } from '@segnavia/format'
import { dispatchFontFailures, dispatchPreflight, MESSAGE, messageFrom } from './bridge.ts'
import type { PageFrameHeightState } from './page-element-layout.ts'
import { dispatchPageFailure } from './page-failure.ts'
import { type PageFrameIdentity, samePageFrame } from './page-frame.ts'
import { dispatchCurrentPageProgress } from './page-frame-progress.ts'
import { printedPageComposeFailure } from './page-printed.ts'
import type { PreparedSlots } from './slot-render.ts'

export interface PageFrameMessageState {
  composedFrame: PageFrameIdentity | undefined
  currentFrame: PageFrameIdentity
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
    target.dispatchEvent(new Event('ready'))
  }
  if (samePageFrame(state.currentFrame, state.composedFrame) && dispatchPreflight(target, message)) return
  const composeFailure = printedPageComposeFailure(message, MESSAGE.composeFailure, state.currentFrame, state.composedFrame)
  if (composeFailure) {
    dispatchPageFailure(target, composeFailure, true)
    return
  }
  if (message?.type === MESSAGE.slotFit && message.slots && samePageFrame(state.currentFrame, state.slotFrame)) state.resolvedSlots?.mergeFit(message.slots)
  if (!state.page || message?.type !== MESSAGE.height || message.height === undefined) return
  if (state.page.printedPages) return
  // A fixed sheet keeps its own height whatever its content reports.
  if (typeof state.page.size === 'object' && state.page.size.height !== 'auto') return
  state.frameHeight.contentHeight = message.height
  target.dataset.measured = ''
  state.fit()
}
