import { expect, test } from 'bun:test'
import { parsePageImageOptions, parseSlideImageOptions } from './entry-options.ts'
import { parseImageRenderOptions } from './options.ts'

test.each([0, -1, 1.5, '2', Number.NaN])('pageImage refuses invalid page selector %p', (page) => {
  expect(() => parsePageImageOptions({ page } as never)).toThrow(
    'pageImage options.page needs to be a positive integer; pass a 1-based page number to clear this refusal.',
  )
})

test('pageImage accepts an absent or positive-integer page selector', () => {
  expect(parsePageImageOptions({})).not.toHaveProperty('page')
  expect(parsePageImageOptions({ page: 2 })).toMatchObject({ page: 2 })
})

test.each([
  ['pageImage', () => parsePageImageOptions({ format: 'jpeg', omitBackground: true })],
  ['slideImage', () => parseSlideImageOptions({ format: 'jpeg', omitBackground: true })],
  ['coverImage', () => parseImageRenderOptions({ format: 'jpeg', omitBackground: true }, 'coverImage')],
])('%s refuses transparent JPEG output', (_call, parse) => {
  expect(parse).toThrow("options.omitBackground: JPEG carries no alpha channel; pass format 'png' or 'webp', or remove omitBackground, to clear this refusal")
})

test.each([
  ['pageImage png', () => parsePageImageOptions({ format: 'png', omitBackground: true })],
  ['pageImage webp', () => parsePageImageOptions({ format: 'webp', omitBackground: true })],
  ['slideImage png', () => parseSlideImageOptions({ format: 'png', omitBackground: true })],
  ['coverImage webp', () => parseImageRenderOptions({ format: 'webp', omitBackground: true }, 'coverImage')],
])('%s accepts omitBackground', (_call, parse) => {
  expect(parse()).toMatchObject({ omitBackground: true })
})

test('image renders refuse a non-boolean omitBackground value', () => {
  expect(() => parsePageImageOptions({ omitBackground: 'yes' } as never)).toThrow(
    'pageImage options.omitBackground needs to be a boolean; pass true, false or omit omitBackground to clear this refusal.',
  )
})
