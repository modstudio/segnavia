import { expect, test } from 'bun:test'
import { RendererUnavailableError } from './errors.ts'
import { renderQueue } from './render-queue.ts'

test('admits up to the limit and queues the rest in order', async () => {
  const queue = renderQueue(1)
  await queue.acquire()
  const order: number[] = []
  const second = queue.acquire().then(() => {
    order.push(2)
  })
  const third = queue.acquire().then(() => {
    order.push(3)
  })
  await Promise.resolve()
  expect(order).toEqual([])
  queue.release()
  await second
  expect(order).toEqual([2])
  queue.release()
  await third
  expect(order).toEqual([2, 3])
})

test('close refuses queued and later acquires and still accepts in-flight release', async () => {
  const queue = renderQueue(1)
  await queue.acquire()
  const queued = queue.acquire()
  queue.close()
  await expect(queued).rejects.toBeInstanceOf(RendererUnavailableError)
  await expect(queued).rejects.toThrow('The renderer is closed; open a new one.')
  await expect(queue.acquire()).rejects.toThrow('The renderer is closed; open a new one.')
  queue.release()
  await expect(queue.acquire()).rejects.toBeInstanceOf(RendererUnavailableError)
})
