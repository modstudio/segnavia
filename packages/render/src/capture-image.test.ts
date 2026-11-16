import { expect, test } from 'bun:test'
import { limitRefusal } from '@segnavia/format'
import type { Page as Tab } from 'playwright-core'
import { captureImage } from './capture-image.ts'
import { RenderRefusedError } from './errors.ts'

test('png capture refuses a screenshot over the byte limit', async () => {
  const tab = {
    screenshot: async () => new Uint8Array(6),
  } as unknown as Tab

  const capture = captureImage(tab, { format: 'png', limits: { bytes: 5 }, limitSetting: 'output.maxBytes' }, false)
  await expect(capture).rejects.toThrow(limitRefusal('bytes', 6, 5, { setting: 'output.maxBytes' }))
  await expect(capture).rejects.toMatchObject({
    exceeded: [{ measure: 'bytes', limit: 5, actual: 6, message: limitRefusal('bytes', 6, 5, { setting: 'output.maxBytes' }) }],
  })
  await expect(capture).rejects.toBeInstanceOf(RenderRefusedError)
})

test('WebP capture reports the last oversized attempt', async () => {
  const sizes = [8, 7, 6]
  const session = {
    send: async () => ({ data: Buffer.alloc(sizes.shift() ?? 0).toString('base64') }),
    detach: async () => {},
  }
  const tab = {
    context: () => ({ newCDPSession: async () => session }),
    evaluate: async () => ({ x: 0, y: 0, width: 10, height: 10, scale: 1 }),
  } as unknown as Tab

  const capture = captureImage(tab, { format: 'webp', quality: [90, 80, 70], limits: { bytes: 5 } }, false)
  await expect(capture).rejects.toThrow(limitRefusal('bytes', 6, 5))
  await expect(capture).rejects.toMatchObject({
    exceeded: [{ measure: 'bytes', limit: 5, actual: 6, message: limitRefusal('bytes', 6, 5) }],
  })
  await expect(capture).rejects.toBeInstanceOf(RenderRefusedError)
})

test('PNG capture forwards omitBackground only when requested', async () => {
  const screenshots: unknown[] = []
  const tab = {
    screenshot: async (options: unknown) => {
      screenshots.push(options)
      return new Uint8Array([1])
    },
  } as unknown as Tab

  await captureImage(tab, { format: 'png' }, false)
  await captureImage(tab, { format: 'png', omitBackground: true }, false)

  expect(screenshots).toEqual([
    { type: 'png', fullPage: false },
    { type: 'png', fullPage: false, omitBackground: true },
  ])
})

test('WebP capture clears its transparent background override after success', async () => {
  const calls: Array<{ method: string; parameters: unknown }> = []
  const session = {
    send: async (method: string, parameters: unknown) => {
      calls.push({ method, parameters })
      return method === 'Page.captureScreenshot' ? { data: 'AQ==' } : {}
    },
    detach: async () => {},
  }
  const tab = {
    context: () => ({ newCDPSession: async () => session }),
    evaluate: async () => ({ x: 0, y: 0, width: 10, height: 10, scale: 1 }),
  } as unknown as Tab

  await captureImage(tab, { format: 'webp', omitBackground: true, quality: [90] }, false)

  expect(calls.map(({ method }) => method)).toEqual([
    'Emulation.setDefaultBackgroundColorOverride',
    'Page.captureScreenshot',
    'Emulation.setDefaultBackgroundColorOverride',
  ])
  expect(calls[0]?.parameters).toEqual({ color: { r: 0, g: 0, b: 0, a: 0 } })
  expect(calls[2]?.parameters).toEqual({})
})

test('WebP capture clears its transparent background override when capture throws', async () => {
  const methods: string[] = []
  const session = {
    send: async (method: string) => {
      methods.push(method)
      if (method === 'Page.captureScreenshot') throw new Error('capture failed')
      return {}
    },
    detach: async () => {},
  }
  const tab = {
    context: () => ({ newCDPSession: async () => session }),
    evaluate: async () => ({ x: 0, y: 0, width: 10, height: 10, scale: 1 }),
  } as unknown as Tab

  await expect(captureImage(tab, { format: 'webp', omitBackground: true, quality: [90] }, false)).rejects.toThrow('capture failed')
  expect(methods).toEqual([
    'Emulation.setDefaultBackgroundColorOverride',
    'Page.captureScreenshot',
    'Emulation.setDefaultBackgroundColorOverride',
  ])
})

test('WebP capture leaves the default background untouched when omitBackground is absent', async () => {
  const calls: Array<{ method: string; parameters: unknown }> = []
  const session = {
    send: async (method: string, parameters: unknown) => {
      calls.push({ method, parameters })
      return { data: 'AQ==' }
    },
    detach: async () => {},
  }
  const tab = {
    context: () => ({ newCDPSession: async () => session }),
    evaluate: async () => ({ x: 0, y: 0, width: 10, height: 10, scale: 1 }),
  } as unknown as Tab

  await captureImage(tab, { format: 'webp', quality: [90] }, false)
  expect(calls).toEqual([
    {
      method: 'Page.captureScreenshot',
      parameters: {
        format: 'webp',
        quality: 90,
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: 10, height: 10, scale: 1 },
      },
    },
  ])
})
