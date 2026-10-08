import { describe, expect, test } from 'bun:test'
import { chooseArrowSide, layoutAnnotation } from './geometry.ts'

const viewport = { width: 1280, height: 720 }

describe('annotation geometry', () => {
  test('an arrow comes from the side with most room, and ties resolve the same way every run', () => {
    expect(chooseArrowSide({ x: 1100, y: 300, width: 100, height: 40 }, viewport)).toBe('left')
    expect(chooseArrowSide({ x: 590, y: 340, width: 100, height: 40 }, viewport)).toBe('left')
  })

  test('a named side without room refuses rather than moving the arrow', () => {
    expect(() => chooseArrowSide({ x: 1200, y: 300, width: 60, height: 40 }, viewport, 'right')).toThrow('arrow needs 72px')
  })

  test('the arrow head stops short of the ring, on its center line', () => {
    const annotation = layoutAnnotation({ x: 100, y: 100, width: 80, height: 40 }, { arrow: 'right', label: 'Save' }, viewport)
    expect(annotation.ring).toEqual({ x: 94, y: 94, width: 92, height: 52 })
    expect(annotation.arrow?.head).toEqual({ x: 196, y: 120 })
    expect(annotation.arrow?.tail.y).toBe(120)
    expect(annotation.arrow?.label).toBe('Save')
  })

  test('highlight false drops the ring but keeps the badge', () => {
    const annotation = layoutAnnotation({ x: 100, y: 100, width: 80, height: 40 }, { number: 2, highlight: false }, viewport)
    expect(annotation.ring).toBeNull()
    expect(annotation.badge?.number).toBe(2)
  })
})

describe('right to left', () => {
  test('the badge sits on the top corner at the inline end', () => {
    const box = { x: 100, y: 100, width: 80, height: 40 }
    expect(layoutAnnotation(box, { number: 1 }, viewport, 'ltr').badge?.center.x).toBe(182)
    expect(layoutAnnotation(box, { number: 1 }, viewport, 'rtl').badge?.center.x).toBe(98)
  })

  test('ties between sides go to the reading-order side', () => {
    const centred = { x: 590, y: 340, width: 100, height: 40 }
    expect(chooseArrowSide(centred, viewport, 'auto', 'ltr')).toBe('left')
    expect(chooseArrowSide(centred, viewport, 'auto', 'rtl')).toBe('right')
  })
})
