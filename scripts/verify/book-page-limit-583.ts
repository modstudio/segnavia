import type { Harness } from './harness.ts'

async function outcome(h: Harness, name: string) {
  const started = performance.now()
  await h.page.goto(h.url(name))
  await h.page.waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
    undefined,
    { timeout: 120_000 },
  )
  return {
    elapsedMs: Math.round(performance.now() - started),
    ...(await h.page.evaluate(() => ({
      failure: document.documentElement.getAttribute('data-segnavia-compose-failure'),
      pages: document.querySelectorAll('[data-segnavia-book-page]').length,
      composedMs: Number(document.documentElement.getAttribute('data-segnavia-composed-ms')) || undefined,
    }))),
  }
}

export async function verifyPageLimit583(h: Harness): Promise<void> {
  const limited = await outcome(h, 'book-page-limit-583-default.html')
  h.check(
    'a 583-page book refuses through the document page limit at 500',
    limited.failure?.includes('583 papers, above the pages limit of 500') === true,
    JSON.stringify(limited),
  )
  const raised = await outcome(h, 'book-page-limit-583-raised.html')
  h.check('a 583-page book composes when the host page limit is raised to 600', raised.failure === null && raised.pages === 583, JSON.stringify(raised))
}
