import { LARGE_BOOK_WAIT_MS } from './book-stress-ready.ts'
import type { Harness } from './harness.ts'

export async function verifyHiddenBookElements(h: Harness) {
  await h.page.goto(h.url('book-paginated-hidden.html'))
  for (const language of ['en', 'he'] as const) {
    for (const testCase of [
      { id: `book-hidden-${language}`, description: 'hidden container is shown' },
      { id: `book-hidden-frame-${language}`, description: 'hidden pages frame is shown' },
    ]) {
      const frame = h.page.frameLocator(`#${testCase.id} iframe[data-segnavia-book-layout="pages"]`)
      await frame.locator('html[data-segnavia-composed],html[data-segnavia-compose-failure]').waitFor({ timeout: LARGE_BOOK_WAIT_MS, state: 'attached' })
      const state = await frame.locator('html').evaluate((root) => ({
        composed: root.hasAttribute('data-segnavia-composed'),
        failure: root.getAttribute('data-segnavia-compose-failure'),
        pages: root.querySelectorAll('[data-segnavia-book-page]').length,
      }))
      h.check(`${testCase.id} composes after its ${testCase.description}`, state.composed && state.failure === null && state.pages > 0, JSON.stringify(state))
    }
  }
}
