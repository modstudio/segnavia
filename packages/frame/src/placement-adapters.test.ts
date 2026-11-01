import { expect, test } from 'bun:test'
import type { Media } from '@segnavia/format'
import { boardItemFrom } from './board-resolutions.ts'
import { DeckController } from './controller.ts'
import { slotAssetFrom } from './slot-render.ts'

const media: Media = { format: 'png', size: { width: 40, height: 20 } }
const src = 'data:image/png;base64,AA=='

test('slotAssetFrom maps an asset reference to a media placement', async () => {
  const calls: unknown[] = []
  const resolveAsset = slotAssetFrom(async (placement, context) => {
    calls.push({ placement, purpose: context.purpose, width: context.width })
    return { kind: 'media', media, src }
  })
  expect(await resolveAsset('logo', { signal: new AbortController().signal })).toBe(src)
  expect(calls).toEqual([{ placement: { kind: 'media', address: 'logo' }, purpose: 'screen', width: 1 }])
})

test('boardItemFrom maps media answers to the unchanged board image answer', async () => {
  const calls: unknown[] = []
  const resolveItem = boardItemFrom(async (placement, context) => {
    calls.push({ placement, purpose: context.purpose, width: context.width })
    return { kind: 'media', media, src }
  })
  await expect(resolveItem({ id: 'logo', kind: 'media', address: 'logo', x: 0, y: 0, width: 120 })).resolves.toEqual({
    kind: 'image',
    src,
    width: 40,
    height: 20,
  })
  expect(calls).toEqual([{ placement: { kind: 'media', address: 'logo' }, purpose: 'screen', width: 120 }])
})

test('deck media content resolves through placements as existing image content', async () => {
  const controller = new DeckController({ placements: { resolve: async () => ({ kind: 'media', media, src }) }, hash: null, persist: false })
  await controller.load({ title: 'Placed', size: { width: 640, height: 360 }, slides: [{ id: 'a', content: { media: { kind: 'media', address: 'logo' } } }] })
  expect(controller.state.content).toEqual({ kind: 'image', src, alt: '', fit: undefined })
  controller.destroy()
})
