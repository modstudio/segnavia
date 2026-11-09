import { expect, test } from 'bun:test'
import { mixedImpositionGeometryRefusal } from './imposition-geometry-policy.ts'

test('mixed page geometries name the pair and how to clear an imposition refusal', () => {
  expect(
    mixedImpositionGeometryRefusal([{ print: { paper: 'letter', orientation: 'portrait' } }, { print: { paper: 'letter', orientation: 'landscape' } }]),
  ).toBe(
    'page 1 geometry 215.9mm by 279.4mm and page 2 geometry 279.4mm by 215.9mm cannot share one imposition; use the same page geometry, or print without imposition, to clear this refusal.',
  )
  expect(
    mixedImpositionGeometryRefusal([
      { print: { paper: 'letter', orientation: 'portrait' } },
      { print: { paper: { width: 215.9, height: 279.4, unit: 'mm' }, orientation: 'portrait' } },
    ]),
  ).toBeUndefined()
})
