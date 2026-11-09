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
