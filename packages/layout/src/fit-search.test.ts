import { expect, test } from 'bun:test'
import { fitSearch, reduceFitGroups } from './fit-search.ts'

test('searches strategies in author order and starts the next only at the prior bound', () => {
  const probes: Array<{ leading: number; size: number }> = []
  const result = fitSearch(
    [
      { strategy: 'leading', authored: 1.5, min: 1, step: 0.1 },
      { strategy: 'size', authored: 20, min: 10, step: 1 },
    ],
    (values) => {
      probes.push({ leading: values.leading, size: values.size })
      return { fits: values.leading <= 1 && values.size <= 16, excess: Math.max(values.leading - 1, values.size - 16) }
    },
  )
  expect(result.values).toEqual(expect.objectContaining({ leading: 1, size: 16 }))
  expect(probes.find((probe) => probe.size < 20)?.leading).toBe(1)
})

test('reports the last exhausted bound and reduces every group strategy to its minimum', () => {
  expect(fitSearch([{ strategy: 'size', authored: 20, min: 12 }], () => ({ fits: false, excess: 4 }))).toEqual({
    values: { size: 12 },
    stopped: { strategy: 'size', bound: 12, excess: 4 },
  })
  expect(
    reduceFitGroups([
      { group: 'cards', values: { size: 18, leading: 1.2 } },
      { group: 'cards', values: { size: 16, leading: 1.4 } },
    ]),
  ).toEqual([
    { group: 'cards', values: { size: 16, leading: 1.2 } },
    { group: 'cards', values: { size: 16, leading: 1.2 } },
  ])
})
