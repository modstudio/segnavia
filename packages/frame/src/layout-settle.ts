export interface LayoutSample {
  inlineSize: number
  paperSize: number
  scrollWidth: number
}

export interface LayoutGeometry {
  paperWidth: number
  textWidth: number
}

export type LayoutSettleDecision = 'settled' | 'wait-for-layout' | 'sample-again' | 'refuse'

// The settle loop refuses after this fixed interval from the end of its load,
// font and image gate. The outer measurement deadline also covers that gate;
// this bound is below its default so the composer refusal can usually arrive first.
export const LAYOUT_SETTLE_MS = 2000

export function decideLayoutSettle(
  sample: LayoutSample,
  previous: LayoutSample | undefined,
  configured: LayoutGeometry,
  elapsedMs: number,
  boundMs: number,
): LayoutSettleDecision {
  if (elapsedMs >= boundMs) return 'refuse'
  const widthsMatch =
    sample.paperSize !== 0 &&
    sample.inlineSize !== 0 &&
    Math.abs(sample.inlineSize - configured.textWidth) <= 0.5 &&
    Math.abs(sample.paperSize - configured.paperWidth) <= 0.5
  if (!widthsMatch) return 'wait-for-layout'
  const repeated =
    previous !== undefined &&
    sample.inlineSize === previous.inlineSize &&
    sample.paperSize === previous.paperSize &&
    sample.scrollWidth === previous.scrollWidth
  return repeated ? 'settled' : 'sample-again'
}
