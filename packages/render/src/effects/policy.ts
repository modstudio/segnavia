export interface SoftMaskFacts {
  backdrop: 'black' | 'other'
  colorSpace: 'gray' | 'other'
  contents: 'single-image' | 'vector' | 'other'
  nested: boolean
  subtype: 'luminosity' | 'other'
}

export type SoftMaskDecision = 'rule1' | 'keep'

export function softMaskAction(facts: SoftMaskFacts): SoftMaskDecision {
  if (facts.subtype !== 'luminosity' || facts.nested) return 'keep'
  if (facts.contents === 'single-image' && facts.backdrop === 'black' && facts.colorSpace === 'gray') return 'rule1'
  return 'keep'
}
