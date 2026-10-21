export interface AnimationTiming {
  endTime: number
  iterations: number
}

import type { AnimationReport } from './bridge.ts'

export function animationReport(timings: readonly AnimationTiming[], hasCanvas: boolean): AnimationReport {
  if (timings.length === 0) return { animated: hasCanvas, lengthMs: null }
  if (timings.some((timing) => !Number.isFinite(timing.endTime) || !Number.isFinite(timing.iterations))) {
    return { animated: true, lengthMs: null }
  }
  return { animated: true, lengthMs: Math.max(0, ...timings.map((timing) => timing.endTime)) }
}
