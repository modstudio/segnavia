import { expect, test } from 'bun:test'
import { convergeLayout } from './converge-layout.ts'

test('convergeLayout settles early without another step', () => {
  const visited: number[] = []
  const result = convergeLayout(
    0,
    (plan) => {
      visited.push(plan)
      return { plan: plan + 1, settled: true }
    },
    3,
  )
  expect(result).toEqual({ plan: 1, converged: true, warnings: [] })
  expect(visited).toEqual([0])
})

test('convergeLayout settles on the last admitted step', () => {
  const result = convergeLayout(0, (plan) => ({ plan: plan + 1, settled: plan === 2 }), 3)
  expect(result).toEqual({ plan: 3, converged: true, warnings: [] })
})

test('convergeLayout warns at the cap and never steps beyond it', () => {
  let steps = 0
  const result = convergeLayout(
    0,
    (plan) => {
      steps += 1
      return { plan: plan + 1, settled: false }
    },
    3,
  )
  expect(result).toEqual({
    plan: 3,
    converged: false,
    warnings: [{ name: 'layout-did-not-converge', steps: 3 }],
  })
  expect(steps).toBe(3)
})

test('convergeLayout stops when its adapter refuses', () => {
  let steps = 0
  const result = convergeLayout(
    0,
    () => {
      steps += 1
      return null
    },
    3,
  )
  expect(result).toBeNull()
  expect(steps).toBe(1)
})
