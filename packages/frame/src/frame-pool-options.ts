import type { FrameReadinessOptions } from './frame-entry.ts'
import type { FrameTitle } from './frame-title.ts'
import type { PreparedSlots } from './slot-render.ts'
import type { HostTransition } from './transition.ts'

export interface PoolOptions extends FrameReadinessOptions {
  neighbors: boolean
  css: string
  csp: string
  dependencyOrigins?: Iterable<string>
  frameTitle: FrameTitle
  transition?: HostTransition
  reducedMotion: boolean
  slots?: PreparedSlots
}
