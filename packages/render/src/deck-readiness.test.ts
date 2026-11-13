import { expect, test } from 'bun:test'
import type { Page as Tab } from 'playwright-core'
import { waitForPrintReady } from './deck-readiness.ts'
import { RenderRefusedError } from './errors.ts'

test('deck readiness watches layout failures only for decks with layout providers', async () => {
  let failureReads = 0
  const withoutLayouts = {
    locator: () => ({ waitFor: async () => {} }),
    frames: () => [
      {
        evaluate: async () => {
          failureReads++
          return 'should not be read'
        },
      },
    ],
  } as unknown as Tab
  await waitForPrintReady(withoutLayouts, { author: false, layouts: false })
  expect(failureReads).toBe(0)

  const failure = 'Layout provider margin refused its composed phase: broken'
  const withLayouts = {
    locator: () => ({ waitFor: () => new Promise<void>(() => {}) }),
    frames: () => [{ evaluate: async () => failure }],
  } as unknown as Tab
  const waiting = waitForPrintReady(withLayouts, { author: false, layouts: true })
  await expect(waiting).rejects.toEqual(expect.objectContaining({ message: failure }))
  await expect(waiting).rejects.toBeInstanceOf(RenderRefusedError)
})
