export interface SoftMaskFacts {
  backdrop: 'black' | 'other'
  colorSpace: 'gray' | 'other'
  contents: 'single-image' | 'vector' | 'other'
  nested: boolean
  oneAxis: 'shared' | 'different' | 'non-shading' | 'unknown'
  structure: 'allowed' | 'other'
  subtype: 'luminosity' | 'other'
}

export type SoftMaskDecision = 'rule1' | 'ruleC' | 'keep'

export function softMaskAction(facts: SoftMaskFacts): SoftMaskDecision {
  if (facts.structure === 'other') return 'keep'
  if (facts.nested) return facts.oneAxis === 'shared' ? 'ruleC' : 'keep'
  if (facts.subtype !== 'luminosity') return 'keep'
  if (facts.contents === 'single-image' && facts.backdrop === 'black' && facts.colorSpace === 'gray') return 'rule1'
  return 'keep'
}

export interface BackdropHoistFacts {
  paintsCapturedRaster: boolean
  thenNonNormalBlend: boolean
  maskSource: boolean
}

export type BackdropHoistDecision = 'keep' | 'hoist'

export function backdropHoistAction(facts: BackdropHoistFacts): BackdropHoistDecision {
  if (facts.maskSource || !facts.paintsCapturedRaster || !facts.thenNonNormalBlend) return 'keep'
  return 'hoist'
}

export interface SourceGroupAfterHoistFacts {
  remainingNonNormalBlend: boolean
}

export type SourceGroupAfterHoistDecision = 'drop-group' | 'keep-group'

export function sourceGroupAfterHoistAction(facts: SourceGroupAfterHoistFacts): SourceGroupAfterHoistDecision {
  return facts.remainingNonNormalBlend ? 'keep-group' : 'drop-group'
}
