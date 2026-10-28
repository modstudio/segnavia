import type { FrameLocator } from 'playwright-core'

export const REPAGINATE_BOUND_MS = 20_000

export async function waitForLargeBook(frame: FrameLocator): Promise<void> {
  const deadline = Date.now() + REPAGINATE_BOUND_MS
  // Defer CDP queries so Chrome can replace its provisional srcdoc with the fetched view.
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  while (Date.now() < deadline) {
    try {
      const ready = await frame
        .locator('html')
        .evaluate((root) => root.hasAttribute('data-segnavia-compose-failure') || root.querySelectorAll('[data-segnavia-book-page]').length >= 300)
      if (ready) return
    } catch {
      // The element replaces its sandboxed srcdoc frame after its large src view arrives.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`The large book did not compose 300 pages or report a failure within ${REPAGINATE_BOUND_MS}ms.`)
}
