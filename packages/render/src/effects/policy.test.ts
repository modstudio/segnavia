import { expect, test } from 'bun:test'
import { type BackdropHoistFacts, backdropHoistAction, type SoftMaskFacts, softMaskAction, sourceGroupAfterHoistAction } from './policy.ts'

const imageMask: SoftMaskFacts = {
  backdrop: 'black',
  colorSpace: 'gray',
  contents: 'single-image',
  nested: false,
  oneAxis: 'unknown',
  structure: 'allowed',
  subtype: 'luminosity',
}

test('selects rule 1 for one grayscale image over black', () => {
  expect(softMaskAction(imageMask)).toBe('rule1')
})

test.each([
  ['nested mask on different axes', { ...imageMask, nested: true, oneAxis: 'different' as const }],
  ['nested mask with non-shading coverage', { ...imageMask, nested: true, oneAxis: 'non-shading' as const }],
  ['vector mask group', { ...imageMask, contents: 'vector' as const }],
  ['non-black backdrop', { ...imageMask, backdrop: 'other' as const }],
  ['non-gray group', { ...imageMask, colorSpace: 'other' as const }],
  ['alpha mask', { ...imageMask, subtype: 'other' as const }],
  ['mask chain with unsupported structure', { ...imageMask, structure: 'other' as const }],
] as const)('keeps a %s', (_label, facts) => {
  expect(softMaskAction(facts)).toBe('keep')
})

test('selects rule C for a nested composite on one shared axis', () => {
  expect(softMaskAction({ ...imageMask, nested: true, oneAxis: 'shared' })).toBe('ruleC')
})

const capturedBlend: BackdropHoistFacts = {
  paintsCapturedRaster: true,
  thenNonNormalBlend: true,
  maskSource: false,
}

test('hoists a captured raster painted before a non-Normal blend', () => {
  expect(backdropHoistAction(capturedBlend)).toBe('hoist')
})

test.each([
  ['mask source', { maskSource: true }],
  ['group with no captured raster', { paintsCapturedRaster: false }],
  ['group with only Normal blending', { thenNonNormalBlend: false }],
] as const)('does not hoist a %s', (_label, patch) => {
  expect(backdropHoistAction({ ...capturedBlend, ...patch })).toBe('keep')
})

test('drops the source group Group when no non-Normal blend remains after the hoist', () => {
  expect(sourceGroupAfterHoistAction({ remainingNonNormalBlend: false })).toBe('drop-group')
})

test('keeps the source group Group when a non-Normal blend remains after the hoist', () => {
  expect(sourceGroupAfterHoistAction({ remainingNonNormalBlend: true })).toBe('keep-group')
})
