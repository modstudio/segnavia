import type { FrameLocator } from 'playwright-core'

// The slowest measured 439-page composition took 413 ms (headless_shell 1194); the bound leaves
// headroom for slower CI machines while still failing a repagination that grows out of proportion.
export const REPAGINATE_BOUND_MS = 5_000
export const LARGE_BOOK_WAIT_MS = 20_000

export async function waitForLargeBook(frame: FrameLocator, expectedPages: number): Promise<void> {
  const deadline = Date.now() + LARGE_BOOK_WAIT_MS
  let lastError = 'none'
  let lastPageCount = 0
  // Defer CDP queries so Chrome can replace its provisional srcdoc with the fetched view.
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  while (Date.now() < deadline) {
    try {
      const state = await frame.locator('html').evaluate(
        (root, count) => ({
          failed: root.hasAttribute('data-segnavia-compose-failure'),
          pages: root.querySelectorAll('[data-segnavia-book-page]').length,
          ready: root.querySelectorAll('[data-segnavia-book-page]').length === count,
        }),
        expectedPages,
      )
      lastPageCount = state.pages
      if (state.failed || state.ready) return
    } catch (error) {
      // The element replaces its sandboxed srcdoc frame after its large src view arrives.
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(
    `The large book did not compose its expected ${expectedPages} pages or report a failure within ${LARGE_BOOK_WAIT_MS}ms; last page count: ${lastPageCount}; last error: ${lastError}.`,
  )
}
