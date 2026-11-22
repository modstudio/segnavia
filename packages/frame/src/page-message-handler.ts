import { type Page, type PreflightProfileInput, resolvePreflightProfile } from '@segnavia/format'
import type { SoundPlacements } from '@segnavia/html'
import { messageFrom } from './bridge.ts'
import type { PageFrameHeightState } from './page-element-layout.ts'
import type { PageFrameIdentity } from './page-frame.ts'
import { handlePageFrameMessage } from './page-frame-message.ts'
import { type PageRequestState, releaseReadyPageRequests } from './page-request.ts'
import type { PreparedSlots } from './slot-render.ts'
import { dispatchSoundPlay } from './sound-play.ts'

interface PageMessageHost extends HTMLElement {
  loadGeneration: number
  composedFrame?: PageFrameIdentity
  documentWrites: number
  frameHeight: PageFrameHeightState
  frameReady: boolean
  pageValue: Page | null
  profileInput: PreflightProfileInput
  pageRequests: PageRequestState
  fit(): void
}

export interface PageMessageFields {
  resolvedSlots: PreparedSlots | undefined
  slotFrame: PageFrameIdentity | undefined
  layoutFrame: PageFrameIdentity | undefined
  loadedDocument: number | undefined
  sounds: SoundPlacements
  documentIsFinal: boolean
}

export function handlePageElementMessage(
  target: unknown,
  event: MessageEvent,
  { resolvedSlots, slotFrame, layoutFrame, loadedDocument, sounds, documentIsFinal }: PageMessageFields,
): void {
  const host = target as PageMessageHost
  const frame = host.querySelector('iframe')
  const currentFrame = { frame, generation: host.loadGeneration }
  handlePageFrameMessage(host, event, {
    composedFrame: host.composedFrame,
    currentFrame,
    documentIsFinal,
    documentIsLoaded: loadedDocument === host.documentWrites,
    frameHeight: host.frameHeight,
    frameReady: host.frameReady,
    layoutFrame,
    page: host.pageValue,
    profile: resolvePreflightProfile(host.profileInput),
    resolvedSlots,
    slotFrame,
    fit: () => host.fit(),
    ready: () => {
      host.frameReady = true
      releaseReadyPageRequests(host.pageRequests)
    },
  })
  dispatchSoundPlay(host, messageFrom(event, frame, resolvePreflightProfile(host.profileInput)), sounds)
}
