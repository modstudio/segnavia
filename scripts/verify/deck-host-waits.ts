import type { Page } from 'playwright-core'

const WAIT_TIMEOUT = 5000

export async function neighborTurnFacts(page: Page) {
  const next = await page.locator('#deck [data-slide-id="slide-2"] iframe').elementHandle()
  if (!next) return { count: await page.locator('#deck iframe').count(), same: false }
  const nextFrame = await next.contentFrame()
  await nextFrame?.waitForLoadState('load', { timeout: WAIT_TIMEOUT }).catch(() => {})
  await next.evaluate((frame: HTMLIFrameElement) => {
    frame.dataset.identity = 'kept'
  })
  const srcdoc = await next.evaluate((frame: HTMLIFrameElement) => frame.srcdoc)
  await page.evaluate(async () => {
    const stage = document.querySelector('#deck') as HTMLElement & { controller: { go(index: number): Promise<void> } }
    await stage.controller.go(1)
  })
  await page
    .waitForFunction(
      () =>
        document.querySelector('#deck [data-active]')?.getAttribute('data-slide-id') === 'slide-2' && document.querySelectorAll('#deck iframe').length === 3,
      undefined,
      { timeout: WAIT_TIMEOUT },
    )
    .catch(() => {})
  return next.evaluate(
    (frame: HTMLIFrameElement, originalSrcdoc) => ({
      count: document.querySelectorAll('#deck iframe').length,
      same: document.querySelector('#deck [data-active] iframe') === frame && frame.dataset.identity === 'kept' && frame.srcdoc === originalSrcdoc,
    }),
    srcdoc,
  )
}

export async function waitForPresentationExit(page: Page) {
  await page.waitForFunction(() => !document.querySelector('#deck-root')?.hasAttribute('data-presenting'), undefined, { timeout: WAIT_TIMEOUT }).catch(() => {})
}
