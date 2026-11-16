import { type Limits, parseLimits } from '@segnavia/format'
import type { CDPSession, Page as Tab } from 'playwright-core'
import { RenderLimitError, RenderRefusedError } from './errors.ts'
import type { ImageOptions } from './options.ts'

async function withTransparentBackground<T>(session: CDPSession, omitBackground: boolean | undefined, capture: () => Promise<T>): Promise<T> {
  if (!omitBackground) return capture()
  await session.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  try {
    return await capture()
  } finally {
    await session.send('Emulation.setDefaultBackgroundColorOverride', {})
  }
}

// One image of what a tab shows. Shared with capture, so a shot and a
// rendered slide are encoded the same way under the same size ceiling.
export async function captureImage(
  tab: Tab,
  options: Pick<ImageOptions, 'format' | 'omitBackground' | 'quality'> & { limits?: Limits; limitSetting?: string },
  fullPage: boolean,
): Promise<Uint8Array> {
  const format = options.format ?? 'png'
  const limits = parseLimits(options.limits, 'host')
  const refusalOptions = options.limitSetting === undefined ? {} : { setting: options.limitSetting }
  if (format !== 'webp') {
    const bytes = await tab.screenshot({
      type: format,
      fullPage,
      ...(format === 'jpeg' ? { quality: options.quality?.[0] ?? 90 } : {}),
      ...(options.omitBackground ? { omitBackground: true } : {}),
    })
    if (limits?.bytes !== undefined && bytes.byteLength > limits.bytes) {
      throw new RenderLimitError('bytes', bytes.byteLength, limits.bytes, refusalOptions)
    }
    return bytes
  }
  // Playwright offers no WebP; Chromium's own capture does, at a quality.
  const session = await tab.context().newCDPSession(tab)
  try {
    return await withTransparentBackground(session, options.omitBackground, async () => {
      const clip = await tab.evaluate((wholePage) => {
        const scale = devicePixelRatio
        if (wholePage) return { x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, scale }
        return { x: scrollX, y: scrollY, width: innerWidth, height: innerHeight, scale }
      }, fullPage)
      let refusal: RenderLimitError | undefined
      for (const quality of options.quality ?? [90, 80, 70]) {
        const { data } = await session.send('Page.captureScreenshot', {
          format: 'webp',
          quality,
          captureBeyondViewport: fullPage,
          clip,
        })
        const bytes = Buffer.from(data, 'base64')
        if (limits?.bytes === undefined || bytes.byteLength <= limits.bytes) return bytes
        refusal = new RenderLimitError('bytes', bytes.byteLength, limits.bytes, refusalOptions)
      }
      if (refusal) throw refusal
      throw new RenderRefusedError('The WebP capture produced no attempt; pass at least one quality value to clear this refusal.')
    })
  } finally {
    await session.detach()
  }
}
