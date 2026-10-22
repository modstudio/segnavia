import { expect, test } from 'bun:test'
import { RenderRefusedError } from '../errors.ts'
import {
  chargeRasterBytes,
  chargeRasterPixels,
  DEFAULT_RASTER_DPI,
  DEFAULT_RASTER_QUALITY,
  elementRasterDpi,
  jpegPixelSize,
  MAX_RASTER_REGION_BYTES,
  MAX_RASTER_REGION_PIXELS,
  MAX_RASTER_TOTAL_BYTES,
  MAX_RASTER_TOTAL_PIXELS,
  pdfRasterBox,
  rasterPixelSize,
  rasterSettings,
  stripJpegIccProfile,
} from './raster.ts'

test('validates raster options and defaults', () => {
  expect(rasterSettings(undefined)).toEqual({ dpi: DEFAULT_RASTER_DPI, quality: DEFAULT_RASTER_QUALITY })
  expect(rasterSettings({ dpi: 72, quality: 1 })).toEqual({ dpi: 72, quality: 1 })
  expect(() => rasterSettings({ dpi: 601 })).toThrow(RenderRefusedError)
  expect(() => rasterSettings({ quality: 0 })).toThrow('effects.raster.quality')
})

test('reads the captured JPEG pixel size', () => {
  expect(jpegPixelSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 75, 0, 150, 3, 1, 2, 3]))).toEqual({ width: 150, height: 75 })
})

test('removes every JPEG ICC profile chunk and preserves other segments', () => {
  const signature = [0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0]
  const icc = (part: number) => [0xff, 0xe2, 0, 16, ...signature, part, 2]
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, ...icc(1), ...icc(2), 0xff, 0xda, 0, 2, 3, 4, 0xff, 0xd9])
  expect(stripJpegIccProfile(jpeg)).toEqual(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xda, 0, 2, 3, 4, 0xff, 0xd9]))
  const profileFree = Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9])
  expect(stripJpegIccProfile(profileFree)).toBe(profileFree)
})

test('the computed custom property overrides dpi and names invalid values', () => {
  expect(elementRasterDpi('', 144)).toBe(144)
  expect(elementRasterDpi(' 300 ', 144)).toBe(300)
  expect(() => elementRasterDpi('wide', 144)).toThrow('--segnavia-raster-dpi')
  expect(() => elementRasterDpi('71', 144)).toThrow(RenderRefusedError)
})

test('maps element boxes into PDF coordinates with scale and page offsets', () => {
  expect(pdfRasterBox({ x: 10, y: 20, width: 100, height: 40 }, 600, 0.75, { x: 9, y: 12 })).toEqual({
    x: 16.5,
    y: 543,
    width: 75,
    height: 30,
  })
})

test('computes charged pixels at region resolution', () => {
  expect(rasterPixelSize({ width: 96, height: 48 }, 150)).toEqual({ width: 150, height: 75, pixels: 11_250 })
  expect(rasterPixelSize({ width: MAX_RASTER_REGION_PIXELS, height: 1 }, 96).pixels).toBe(MAX_RASTER_REGION_PIXELS)
})

test('charges region and render pixel and byte ceilings by name', () => {
  expect(() => chargeRasterPixels(0, MAX_RASTER_REGION_PIXELS + 1)).toThrow('backdrop raster region')
  expect(() => chargeRasterPixels(MAX_RASTER_TOTAL_PIXELS, 1)).toThrow('total pixels')
  expect(() => chargeRasterBytes(0, MAX_RASTER_REGION_BYTES + 1)).toThrow('encoded bytes')
  expect(() => chargeRasterBytes(MAX_RASTER_TOTAL_BYTES, 1)).toThrow('total encoded bytes')
})
