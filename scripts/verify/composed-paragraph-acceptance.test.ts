import { expect, test } from 'bun:test'
import type { Frame } from 'playwright-core'
import { waitForPrintedComposition } from './composed-paragraph-acceptance.ts'

test('polls hidden printed-page frames without depending on animation frames', async () => {
  let polling: number | string | undefined
  const frame = {
    waitForFunction: (_predicate: unknown, _argument: unknown, options: { polling?: number | string }) => {
      polling = options.polling
      return Promise.resolve()
    },
    evaluate: () =>
      Promise.resolve({
        composed: true,
        composedMs: '393',
        failure: null,
        progress: '1/1',
        pages: 1,
        paragraphs: 26,
        composedParagraphs: 82,
      }),
  } as unknown as Frame

  await waitForPrintedComposition(frame, 'he', 1)

  expect(polling).toBe(100)
})
