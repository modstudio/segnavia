import { expect, mock, test } from 'bun:test'
import { Cover, type coverDigest } from '@segnavia/format'
import { coverImagePlan } from './cover-image.ts'
import type { Renderer } from './renderer.ts'

const coverDocument = (html: string, print?: { paper: { width: number; height: number; unit: 'mm' } }) => ({
  type: 'document' as const,
  kind: 'page' as const,
  print,
  children: [{ type: 'page' as const, body: { html } }],
})
const cover = Cover.parse({ page: coverDocument('<h1>Cover</h1>') })

type Same<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false
const sharedCoverInput: Same<Parameters<Renderer['coverImage']>[0], Parameters<typeof coverDigest>[0]> = true
void sharedCoverInput

const browser = {
  isConnected: () => true,
  on: () => browser,
  close: async () => {},
}

mock.module('playwright-core', () => ({ chromium: { launch: async () => browser } }))

test('renderer coverImage refuses an invalid input through the returned promise', async () => {
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const rendered = renderer.coverImage({ page: { type: 'document', kind: 'printed', children: [] } }, { width: 160 })
  expect(rendered).toBeInstanceOf(Promise)
  await expect(rendered).rejects.toThrow('page')
  await renderer.close()
})

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

test('defaults to WebP and forwards asset policy options', () => {
  const assets = async () => ({ body: new Uint8Array(), contentType: 'text/plain' })
  const origins = [{ origin: 'https://example.com', kinds: ['image'] as const }]
  const plan = coverImagePlan(cover, {
    width: 320,
    assets,
    origins,
  })
  expect(plan.options.format).toBe('webp')
  expect(plan.options.assets).toBe(assets)
  expect(plan.options.origins).toBe(origins)
})

test('uses a non-default cover sheet aspect', () => {
  const portrait = Cover.parse({ page: coverDocument('', { paper: { width: 100, height: 150, unit: 'mm' } }) })
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
