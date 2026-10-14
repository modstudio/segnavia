import { expect, test } from 'bun:test'
import { applyAffine, IDENTITY_MATRIX, invertAffine, multiplyAffine } from './affine.ts'

test('pattern matrix maps domain axes into device space', () => {
  expect(multiplyAffine([2, 0, 0, 3, 4, 5], [1, 0, 0, 1, 0, 0])).toEqual([2, 0, 0, 3, 4, 5])
})

test('invertAffine undoes a scale and translation', () => {
  const inverse = invertAffine([10, 0, 0, 10, 5, 6])
  expect(inverse).toBeDefined()
  expect(multiplyAffine([10, 0, 0, 10, 5, 6], inverse ?? [])).toEqual([1, 0, 0, 1, 0, 0])
})

test('applyAffine maps a point through the matrix', () => {
  expect(applyAffine(IDENTITY_MATRIX, 3, 4)).toEqual({ x: 3, y: 4 })
  expect(applyAffine([2, 0, 0, 3, 5, 6], 1, 1)).toEqual({ x: 7, y: 9 })
})
