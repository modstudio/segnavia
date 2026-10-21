import { expect, test } from 'bun:test'
import { RenderTimeoutError, withinRenderDeadline, withinRenderPermit } from './render-deadline.ts'

test('one deadline aborts slot preparation and releases its render permit', async () => {
  let released = false
  let receivedSignal: AbortSignal | undefined
  const result = withinRenderPermit(
    5,
    () => Promise.resolve(),
    () => {
      released = true
    },
    (deadline) => {
      receivedSignal = deadline.signal
      return new Promise<never>(() => {})
    },
  )
  await expect(result).rejects.toBeInstanceOf(RenderTimeoutError)
  expect(receivedSignal?.aborted).toBe(true)
  expect(released).toBe(true)
})

test('a queued render receives its full deadline after its permit arrives', async () => {
  let allowPermit!: () => void
  const permit = new Promise<void>((resolve) => {
    allowPermit = resolve
  })
  let started = false
  const result = withinRenderPermit(
    5,
    () => permit,
    () => {},
    async (deadline) => {
      started = true
      expect(deadline.remaining()).toBeGreaterThan(0)
      return 'rendered'
    },
  )
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(started).toBe(false)
  allowPermit()
  await expect(result).resolves.toBe('rendered')
})

test('later render phases receive only the time remaining', async () => {
  await withinRenderDeadline(50, async (deadline) => {
    const first = deadline.remaining()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(deadline.remaining()).toBeLessThan(first)
  })
})
