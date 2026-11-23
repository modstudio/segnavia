import type { FontFailure, OriginApproval, PreflightProfile } from '@segnavia/format'
import type { FormsOption } from './bridge.ts'
import type { FrameReadinessOptions } from './frame-entry.ts'
import type { FrameTitle } from './frame-title.ts'
import type { ServeFrame } from './frame-write.ts'
import type { PreparedSlots } from './slot-render.ts'
import type { HostTransition } from './transition.ts'

export interface PoolOptions extends FrameReadinessOptions {
  neighbors: boolean
  css: string
  csp: string
  forms?: FormsOption
  origins?: Iterable<OriginApproval>
  fontCss?: string
  fontFailures?: FontFailure[]
  frameTitle: FrameTitle
  transition?: HostTransition
  reducedMotion: boolean
  slots?: PreparedSlots
  preflight?: PreflightProfile
  serveFrame?: ServeFrame
}
