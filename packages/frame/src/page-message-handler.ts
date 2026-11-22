import { type Page, type PreflightProfileInput, resolvePreflightProfile } from '@segnavia/format'
import type { ResolvedSoundPlacement } from '@segnavia/html'
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
  documentIsFinal: boolean
  loadedDocument?: number
  documentWrites: number
  frameHeight: PageFrameHeightState
  frameReady: boolean
  layoutFrame?: PageFrameIdentity
  pageValue: Page | null
  profileInput: PreflightProfileInput
  resolvedSlots?: PreparedSlots
  slotFrame?: PageFrameIdentity
  pageRequests: PageRequestState
  sounds: Map<string, ResolvedSoundPlacement>
  fit(): void
}

export function handlePageElementMessage(target: unknown, event: MessageEvent): void {
  const host = target as PageMessageHost
  const frame = host.querySelector('iframe')
  const currentFrame = { frame, generation: host.loadGeneration }
  handlePageFrameMessage(host, event, {
    composedFrame: host.composedFrame,
    currentFrame,
    documentIsFinal: host.documentIsFinal,
    documentIsLoaded: host.loadedDocument === host.documentWrites,
    frameHeight: host.frameHeight,
    frameReady: host.frameReady,
    layoutFrame: host.layoutFrame,
    page: host.pageValue,
    profile: resolvePreflightProfile(host.profileInput),
    resolvedSlots: host.resolvedSlots,
    slotFrame: host.slotFrame,
    fit: () => host.fit(),
    ready: () => {
      host.frameReady = true
      releaseReadyPageRequests(host.pageRequests)
    },
  })
  dispatchSoundPlay(host, messageFrom(event, frame, resolvePreflightProfile(host.profileInput)), host.sounds)
}
