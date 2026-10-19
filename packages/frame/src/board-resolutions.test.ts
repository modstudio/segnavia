import { expect, test } from 'bun:test'
import type { BoardItem } from '@segnavia/format'
import { BoardResolutions } from './board-resolutions.ts'

const item = (id: string, address = id, kind: BoardItem['kind'] = 'image'): BoardItem => ({ id, address, kind, x: 0, y: 0, width: 100 })
const image = { kind: 'image' as const, src: 'image.png', width: 640, height: 480 }
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test('deduplicates requests by address and shares the resolved value', async () => {
  const resolutions = new BoardResolutions()
  let calls = 0
  resolutions.resolver = async () => {
    calls += 1
    return image
  }
  const first = item('first', 'shared')
  const second = item('second', 'shared')
  resolutions.request(
    first,
    () => {},
    () => {},
  )
  resolutions.request(
    second,
    () => {},
    () => {},
  )
  await settle()
  expect(calls).toBe(1)
  expect(resolutions.value(first.address)).toEqual(image)
  expect(resolutions.value(second.address)).toEqual(image)
})

test('reports a refused value once and does not expose it', async () => {
  const resolutions = new BoardResolutions()
  const paper = item('paper', 'paper', 'paper')
  const failures: unknown[] = []
  resolutions.resolver = async () => image
  resolutions.request(
    paper,
    () => {},
    (failedItem, error) => {
      if (resolutions.fail(failedItem)) failures.push(error)
    },
  )
  await settle()
  expect(failures).toHaveLength(1)
  expect(resolutions.value(paper.address)).toBeUndefined()
})

test('marks a failure only once', () => {
  const resolutions = new BoardResolutions()
  const failed = item('failed')
  resolutions.resolver = async () => image
  resolutions.request(
    failed,
    () => {},
    () => {},
  )
  expect(resolutions.fail(failed)).toBe(true)
  expect(resolutions.fail(failed)).toBe(false)
})

test('drops entries outside the kept addresses', async () => {
  const resolutions = new BoardResolutions()
  let calls = 0
  const dropped = item('dropped')
  resolutions.resolver = async () => {
    calls += 1
    return image
  }
  resolutions.request(
    dropped,
    () => {},
    () => {},
  )
  await settle()
  resolutions.keep(new Set())
  resolutions.request(
    dropped,
    () => {},
    () => {},
  )
  await settle()
  expect(calls).toBe(2)
})
