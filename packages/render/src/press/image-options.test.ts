import { expect, test } from 'bun:test'
import { RenderRefusedError } from '../errors.ts'
import { assertPressImageOptions } from './image-options.ts'

test('lossless conversion accepts omitted encoding and quality', () => {
  expect(() => assertPressImageOptions({ images: 'convert' })).not.toThrow()
  expect(() => assertPressImageOptions({ images: 'convert', imageEncoding: 'lossless' })).not.toThrow()
  expect(() => assertPressImageOptions({ images: 'convert', imageEncoding: 'jpeg' })).not.toThrow()
  expect(() => assertPressImageOptions({ images: 'convert', imageEncoding: 'jpeg', imageQuality: 85 })).not.toThrow()
})

test('imageEncoding without images convert is refused', () => {
  expect(() => assertPressImageOptions({ imageEncoding: 'jpeg' })).toThrow(RenderRefusedError)
  expect(() => assertPressImageOptions({ imageEncoding: 'jpeg' })).toThrow(/images: 'convert'/)
  expect(() => assertPressImageOptions({ images: 'keep', imageEncoding: 'lossless' })).toThrow(/images: 'convert'/)
})

test('imageQuality with lossless encoding is refused', () => {
  expect(() => assertPressImageOptions({ images: 'convert', imageQuality: 85 })).toThrow(/imageEncoding: 'jpeg'/)
  expect(() => assertPressImageOptions({ images: 'convert', imageEncoding: 'lossless', imageQuality: 60 })).toThrow(/imageEncoding: 'jpeg'/)
})

test.each([0, 101, 85.5, Number.NaN, -1])('imageQuality %p is refused as out of range', (imageQuality) => {
  expect(() => assertPressImageOptions({ images: 'convert', imageEncoding: 'jpeg', imageQuality })).toThrow(
    `The press image quality is ${String(imageQuality)}; supported: an integer from 1 to 100.`,
  )
})
