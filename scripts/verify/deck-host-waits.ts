import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

export async function neighborTurnFacts(h: Harness) {
  const { page } = h
  const next = await page.locator('#deck [data-slide-id="slide-2"] iframe').elementHandle()
  if (!next) return { count: await page.locator('#deck iframe').count(), same: false }
  const nextFrame = await next.contentFrame()
  await nextFrame?.waitForLoadState('load', { timeout: BOUNDED_WAIT_MS }).catch(() => {})
  await next.evaluate((frame: HTMLIFrameElement) => {
    frame.dataset.identity = 'kept'
  })
  const srcdoc = await next.evaluate((frame: HTMLIFrameElement) => frame.srcdoc)
  await page.evaluate(async () => {
    const stage = document.querySelector('#deck') as HTMLElement & { controller: { go(index: number): Promise<void> } }
    await stage.controller.go(1)
  })
  await h.waitFor('#deck', (data) => data.slide === '2', { timeout: BOUNDED_WAIT_MS })
  await page.waitForFunction(() => document.querySelectorAll('#deck iframe').length === 3, undefined, { timeout: BOUNDED_WAIT_MS }).catch(() => {})
  return next.evaluate(
    (frame: HTMLIFrameElement, originalSrcdoc) => ({
      count: document.querySelectorAll('#deck iframe').length,
      same: document.querySelector('#deck [data-active] iframe') === frame && frame.dataset.identity === 'kept' && frame.srcdoc === originalSrcdoc,
    }),
    srcdoc,
  )
}
