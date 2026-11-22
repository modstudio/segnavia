import { expect, test } from 'bun:test'
import type { Variable } from '@segnavia/format'
import { continuousContentSetPoints } from './continuous-variable-set-points.ts'

const document = {
  setPoints: [
    { id: 'one', name: 'topic', value: 'One', section: 'chapter' },
    { id: 'two', name: 'topic', value: 'Two', section: 'chapter' },
  ],
}
const part = {
  bytes: new Uint8Array([1]),
  pages: 3,
  destinations: new Map([
    ['one', { page: 1, x: 0, y: 500 }],
    ['two', { page: 3, x: 0, y: 400 }],
  ]),
}

test('continuous set points skip PDF text inspection without a start declaration', async () => {
  let reads = 0
  const variables: Variable[] = [{ name: 'topic', kind: 'text', from: 'content', pick: 'first' }]
  const points = await continuousContentSetPoints(document, part, variables, async () => {
    reads += 1
    return new Map()
  })
  expect(reads).toBe(0)
  expect(points.map((point) => point.atStart)).toEqual([false, false])
})

test('continuous set points inspect only their pages for a start declaration', async () => {
  let requested: readonly number[] = []
  const variables: Variable[] = [{ name: 'topic', kind: 'text', from: 'content', pick: 'start' }]
  const points = await continuousContentSetPoints(document, part, variables, async (_pdf, pages) => {
    requested = pages
    return new Map([
      [1, 550],
      [3, null],
    ])
  })
  expect(requested).toEqual([1, 3])
  expect(points.map((point) => point.atStart)).toEqual([false, true])
})
