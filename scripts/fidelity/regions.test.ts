import { describe, expect, test } from 'bun:test'
import { blendedRegionBoxes, type ComputedStyleFacts } from './regions.ts'

const facts = (overrides: Partial<ComputedStyleFacts>): ComputedStyleFacts => ({
  box: { x: 10, y: 20, width: 30, height: 40 },
  backgroundImage: 'none',
  borderImage: 'none',
  opacity: '1',
  mixBlendMode: 'normal',
  filter: 'none',
  backdropFilter: 'none',
  boxShadow: 'none',
  textShadow: 'none',
  mask: 'none',
  maskImage: 'none',
  ...overrides,
})

describe('blended region collection', () => {
  test('grows a shadow region by its offset, blur, and spread', () => {
    expect(blendedRegionBoxes([facts({ boxShadow: 'rgb(0, 0, 0) 2px -3px 4px 5px' })])).toEqual([{ x: 3, y: 8, width: 48, height: 58 }])
  })

  test('an element without a blending property contributes nothing', () => {
    expect(blendedRegionBoxes([facts({})])).toEqual([])
  })
})
