export interface SoftMaskFacts {
  backdrop: 'black' | 'other'
  colorSpace: 'gray' | 'other'
  contents: 'single-image' | 'vector' | 'other'
  nested: boolean
  oneAxis: 'shared' | 'different' | 'non-shading' | 'unknown'
  subtype: 'luminosity' | 'other'
}

export type SoftMaskDecision = 'rule1' | 'ruleC' | 'keep'

export function softMaskAction(facts: SoftMaskFacts): SoftMaskDecision {
  if (facts.nested) return facts.oneAxis === 'shared' ? 'ruleC' : 'keep'
  if (facts.subtype !== 'luminosity') return 'keep'
  if (facts.contents === 'single-image' && facts.backdrop === 'black' && facts.colorSpace === 'gray') return 'rule1'
  return 'keep'
}
