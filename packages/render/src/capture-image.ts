import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import type { ImageOptions } from './options.ts'

// One image of what a tab shows. Shared with capture, so a shot and a
// rendered slide are encoded the same way under the same size ceiling.
export async function captureImage(tab: Tab, options: Pick<ImageOptions, 'format' | 'quality' | 'limits'>, fullPage: boolean): Promise<Uint8Array> {
  const format = options.format ?? 'png'
  if (format !== 'webp') {
    return tab.screenshot({ type: format, fullPage, ...(format === 'jpeg' ? { quality: options.quality?.[0] ?? 90 } : {}) })
  }
  // Playwright offers no WebP; Chromium's own capture does, at a quality.
  const session = await tab.context().newCDPSession(tab)
  try {
    const clip = await tab.evaluate((wholePage) => {
      const scale = devicePixelRatio
      if (wholePage) return { x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, scale }
      return { x: scrollX, y: scrollY, width: innerWidth, height: innerHeight, scale }
    }, fullPage)
    for (const quality of options.quality ?? [90, 80, 70]) {
      const { data } = await session.send('Page.captureScreenshot', {
        format: 'webp',
        quality,
        captureBeyondViewport: fullPage,
        clip,
      })
      const bytes = Buffer.from(data, 'base64')
      if (options.limits?.maxBytes === undefined || bytes.byteLength <= options.limits.maxBytes) return bytes
    }
  } finally {
    await session.detach()
  }
  throw new RenderRefusedError(`The image is larger than ${options.limits?.maxBytes} bytes at every quality tried.`)
}
