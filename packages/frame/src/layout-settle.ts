export interface LayoutSample {
  inlineSize: number
  scrollWidth: number
}

export interface LayoutGeometry {
  textWidth: number
}

export type LayoutSettleDecision = 'settled' | 'wait-for-layout' | 'sample-again' | 'refuse'

// Each unchanged, unsettled width streak gets this interval to become stable.
export const LAYOUT_SETTLE_MS = 2000

export function decideLayoutSettle(
  sample: LayoutSample,
  previous: LayoutSample | undefined,
  configured: LayoutGeometry,
  elapsedMs: number,
  boundMs: number,
): LayoutSettleDecision {
  const widthsMatch = sample.inlineSize !== 0 && Math.abs(sample.inlineSize - configured.textWidth) <= 0.5
  const repeated = previous !== undefined && sample.inlineSize === previous.inlineSize && sample.scrollWidth === previous.scrollWidth
  if (widthsMatch && repeated) return 'settled'
  if (elapsedMs >= boundMs) return 'refuse'
  return widthsMatch ? 'sample-again' : 'wait-for-layout'
}
