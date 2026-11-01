import type { Harness } from './harness.ts'

export async function verifyPlacedMediaBook(h: Harness) {
  await h.page.goto(h.url('book-placed-media.html'))
  await h.page.waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
    undefined,
    { timeout: 20_000 },
  )
  const result = await h.page.locator('[data-segnavia-window] img[data-placed-check]').evaluateAll((images) => {
    const papers = new Set(images.map((image) => image.closest('[data-segnavia-book-page]')?.getAttribute('data-segnavia-book-page')))
    const text = images[0]?.closest('[data-segnavia-text]')
    return {
      images: images.length,
      papers: papers.size,
      capped: Boolean(images[0] && text && images[0].getBoundingClientRect().height <= text.getBoundingClientRect().height + 0.5),
      resolved: images[0]?.getAttribute('src')?.startsWith('data:image/svg+xml,') ?? false,
    }
  })
  h.check(
    'a resolved placed image is capped and kept on one book page',
    result.images === 1 && result.papers === 1 && result.capped && result.resolved,
    JSON.stringify(result),
  )
}
