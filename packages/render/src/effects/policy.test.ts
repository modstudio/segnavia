import { expect, test } from 'bun:test'
import { type SoftMaskFacts, softMaskAction } from './policy.ts'

const imageMask: SoftMaskFacts = {
  backdrop: 'black',
  colorSpace: 'gray',
  contents: 'single-image',
  nested: false,
  subtype: 'luminosity',
}

test('selects rule 1 for one grayscale image over black', () => {
  expect(softMaskAction(imageMask)).toBe('rule1')
})

test.each([
  ['nested mask', { ...imageMask, nested: true }],
  ['vector mask group', { ...imageMask, contents: 'vector' as const }],
  ['non-black backdrop', { ...imageMask, backdrop: 'other' as const }],
  ['non-gray group', { ...imageMask, colorSpace: 'other' as const }],
  ['alpha mask', { ...imageMask, subtype: 'other' as const }],
] as const)('keeps a %s', (_label, facts) => {
  expect(softMaskAction(facts)).toBe('keep')
})
