import type { Page as Tab } from 'playwright-core'
import type { JpegDecoder } from './press/image.ts'

export function browserJpegDecoder(tab: Tab): JpegDecoder {
  return async (bytes) => {
    const encoded = Buffer.from(bytes).toString('base64')
    const decoded = await tab.evaluate(async (base64) => {
      const binary = atob(base64)
      const source = Uint8Array.from(binary, (value) => value.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([source], { type: 'image/jpeg' }), {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
      })
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Chromium could not create a 2D canvas for JPEG decoding')
        context.drawImage(bitmap, 0, 0)
        const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data
        const rgb = new Uint8Array(bitmap.width * bitmap.height * 3)
        for (let pixel = 0; pixel < bitmap.width * bitmap.height; pixel++) {
          rgb[pixel * 3] = rgba[pixel * 4] ?? 0
          rgb[pixel * 3 + 1] = rgba[pixel * 4 + 1] ?? 0
          rgb[pixel * 3 + 2] = rgba[pixel * 4 + 2] ?? 0
        }
        let value = ''
        for (let offset = 0; offset < rgb.length; offset += 32_768) value += String.fromCharCode(...rgb.subarray(offset, Math.min(rgb.length, offset + 32_768)))
        return { width: bitmap.width, height: bitmap.height, rgb: btoa(value) }
      } finally {
        bitmap.close()
      }
    }, encoded)
    return { width: decoded.width, height: decoded.height, rgb: new Uint8Array(Buffer.from(decoded.rgb, 'base64')) }
  }
}
