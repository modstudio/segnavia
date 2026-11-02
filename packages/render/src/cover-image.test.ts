import { expect, test } from 'bun:test'
import { Cover } from '@segnavia/format'
import { coverImagePlan } from './cover-image.ts'

const cover = Cover.parse({ page: { html: '<h1>Cover</h1>' } })

test.each([
  [160, 100],
  [320, 200],
  [800, 500],
  [1601, 1000],
])('derives an exact %i × %i cover image', (width, height) => {
  const plan = coverImagePlan(cover, { width })
  expect(plan.height).toBe(height)
  expect(plan.options.scale).toBe(width / 605)
})

test('defaults to WebP and passes no dependencies', () => {
  const plan = coverImagePlan(cover, {
    width: 320,
    dependencies: async () => ({ body: new Uint8Array(), contentType: 'text/plain' }),
    dependencyOrigins: ['https://example.com'],
  } as never)
  expect(plan.options.format).toBe('webp')
  expect(plan.options).not.toHaveProperty('dependencies')
  expect(plan.options).not.toHaveProperty('dependencyOrigins')
})

test('uses a non-default cover sheet aspect', () => {
  const portrait = Cover.parse({ page: { html: '', print: { paper: { width: 100, height: 150, unit: 'mm' } } } })
  expect(coverImagePlan(portrait, { width: 200 }).height).toBe(300)
})

test('keeps PNG and refuses a non-positive or fractional width', () => {
  expect(coverImagePlan(cover, { width: 160, format: 'png' }).options.format).toBe('png')
  expect(() => coverImagePlan(cover, { width: 0 })).toThrow('positive integer pixel width')
  expect(() => coverImagePlan(cover, { width: 10.5 })).toThrow('positive integer pixel width')
})

test('refuses a missing options object by naming the width', () => {
  expect(() => coverImagePlan(cover, undefined)).toThrow('Cover image width is undefined; use a positive integer pixel width')
  expect(() => coverImagePlan(cover, null)).toThrow('Cover image width is undefined; use a positive integer pixel width')
})
