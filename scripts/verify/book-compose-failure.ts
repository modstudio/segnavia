import type { Harness } from './harness.ts'

export async function verifyComposeFailure(h: Harness) {
  const { page, check } = h
  await page.addInitScript(() => {
    const facts = { errors: [] as string[], ready: 0 }
    Object.defineProperty(window, '__composeFailure', { value: facts })
    window.addEventListener(
      'error',
      (event) => {
        if (event.target instanceof HTMLElement && event.target.id === 'book-compose-failure') facts.errors.push((event as ErrorEvent).message)
      },
      true,
    )
    window.addEventListener(
      'ready',
      (event) => {
        if (event.target instanceof HTMLElement && event.target.id === 'book-compose-failure') facts.ready++
      },
      true,
    )
  })
  await page.goto(h.url('book-compose-failure.html'))
  await page.frameLocator('#book-compose-failure iframe[data-segnavia-book-layout="flow"]').locator('[data-segnavia-flow]').first().waitFor()
  const readyBefore = await page.evaluate(() => (window as unknown as { __composeFailure: { ready: number } }).__composeFailure.ready)
  await page.locator('#book-compose-failure').evaluate((element) => element.setAttribute('layout', 'pages'))
  await page.waitForFunction(() => (window as unknown as { __composeFailure: { errors: string[] } }).__composeFailure.errors.length > 0)
  const facts = await page.evaluate(() => {
    const book = document.getElementById('book-compose-failure') as HTMLElement & { layout?: string }
    const state = (window as unknown as { __composeFailure: { errors: string[]; ready: number } }).__composeFailure
    const shown = [...book.querySelectorAll<HTMLIFrameElement>('iframe[data-segnavia-book-layout]')]
      .filter((frame) => !frame.hidden)
      .map((frame) => frame.dataset.segnaviaBookLayout)
    return { ...state, layout: book.layout, shown }
  })
  check(
    'a paginated book over the page limit reports its refusal and keeps the working layout shown',
    facts.errors.length === 1 &&
      facts.errors[0]?.includes('above the pages limit of 500') === true &&
      facts.ready === readyBefore &&
      facts.layout === 'flow' &&
      facts.shown.join() === 'flow',
    JSON.stringify(facts),
  )
}
