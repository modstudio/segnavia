import { expect, test } from 'bun:test'
import { Deck, Document, type Media, Page } from '@segnavia/format'
import { placementPlaceholderSource } from '@segnavia/html'
import { boardItemFrom } from './board-resolutions.ts'
import { DeckController } from './controller.ts'
import { preparedDeckValuePrint } from './print.ts'
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
  expect(calls).toEqual([{ placement: { kind: 'media', address: 'logo' }, purpose: 'screen', width: undefined }])
})

test('slotAssetFrom passes caller context and otherwise omits an unknown width', async () => {
  const contexts: unknown[] = []
  const resolver = async (_placement: unknown, context: unknown) => {
    contexts.push(context)
    return { kind: 'media' as const, media, src }
  }
  await slotAssetFrom(resolver)('default', { signal: new AbortController().signal })
  await slotAssetFrom(resolver, { purpose: 'print', width: 240 })('print', { signal: new AbortController().signal })
  expect(contexts).toEqual([
    { purpose: 'screen', signal: expect.any(AbortSignal) },
    { purpose: 'print', width: 240, signal: expect.any(AbortSignal) },
  ])
})

test('boardItemFrom maps fixed pages, refuses fluid pages, and passes through other assets', async () => {
  const fixedDocument = Document.parse({
    type: 'document',
    kind: 'page',
    size: { width: 320, height: 200 },
    settings: { scripts: 'refuse' },
    children: [{ type: 'page', body: { html: '<p>Fixed</p>' } }],
  })
  const fixed = Page.parse({ html: '<p>Fixed</p>', size: { width: 320, height: 200 } })
  const fluid = Page.parse({ html: '<p>Fluid</p>' })
  const boardPage = { id: 'page', kind: 'page' as const, address: 'page', x: 0, y: 0, width: 120 }
  await expect(boardItemFrom(async () => ({ kind: 'page', page: fixed }))(boardPage)).resolves.toEqual({
    kind: 'page',
    page: fixedDocument,
    size: { width: 320, height: 200 },
  })
  await expect(boardItemFrom(async () => ({ kind: 'page', page: fluid }))(boardPage)).rejects.toThrow('has no fixed size')
  const shot = { kind: 'shot' as const, src, width: 40, height: 20 }
  await expect(boardItemFrom(async () => shot)({ id: 'shot', kind: 'shot', address: 'shot', x: 0, y: 0, width: 120 })).resolves.toBe(shot)
})

test('boardItemFrom refuses an unsafe media source', async () => {
  const resolveItem = boardItemFrom(async () => ({ kind: 'media', media, src: 'https://example.com/image.png' }))
  await expect(resolveItem({ id: 'logo', kind: 'media', address: 'logo', x: 0, y: 0, width: 120 })).rejects.toThrow('could not be resolved')
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
  await controller.loadDeckValue({
    title: 'Placed',
    size: { width: 640, height: 360 },
    slides: [{ id: 'a', content: { media: { kind: 'media', address: 'logo' } } }],
  })
  expect(controller.state.content).toEqual({ kind: 'image', src, alt: '', fit: undefined })
  controller.destroy()
})

test('deck media reports each unusable resolver answer and keeps the placeholder', async () => {
  const cases = [
    { reason: 'missing', resolve: async () => undefined },
    { reason: 'invalid', resolve: async () => ({ kind: 'page' as const, page: Page.parse({ html: '<p>Page</p>' }) }) },
    { reason: 'refused-src', resolve: async () => ({ kind: 'media' as const, media, src: 'https://example.com/image.png' }) },
    {
      reason: 'failed',
      resolve: async () => {
        throw new Error('unavailable')
      },
    },
  ] as const
  for (const entry of cases) {
    const reports: Array<{ reason: string }> = []
    const controller = new DeckController({ placements: { resolve: entry.resolve, report: (report) => reports.push(report) }, hash: null, persist: false })
    await controller.loadDeckValue({
      title: 'Placed',
      size: { width: 640, height: 360 },
      slides: [{ id: 'a', content: { media: { kind: 'media', address: 'logo' } } }],
    })
    expect(controller.state.content).toMatchObject({ kind: 'image', src: placementPlaceholderSource() })
    expect(reports).toEqual([expect.objectContaining({ reason: entry.reason })])
    controller.destroy()
  }
})

test('changing controller placements re-resolves the shown media slide', async () => {
  const first = 'data:image/png;base64,AA=='
  const second = 'data:image/png;base64,AQ=='
  const controller = new DeckController({ placements: { resolve: async () => ({ kind: 'media', media, src: first }) }, hash: null, persist: false })
  await controller.loadDeckValue({
    title: 'Placed',
    size: { width: 640, height: 360 },
    slides: [{ id: 'a', content: { media: { kind: 'media', address: 'logo' } } }],
  })
  const shown = new Promise<void>((resolve) => controller.addEventListener('slide', () => resolve(), { once: true }))
  controller.placements = { resolve: async () => ({ kind: 'media', media, src: second }) }
  await shown
  expect(controller.state.content).toMatchObject({ kind: 'image', src: second })
  controller.destroy()
})

test('deck print preparation resolves media and uses the placeholder when no resolver is supplied', async () => {
  const deck = Deck.parse({
    title: 'Placed',
    size: { width: 640, height: 360 },
    slides: [{ id: 'a', content: { media: { kind: 'media' as const, address: 'logo' } } }],
  })
  const resolved = await preparedDeckValuePrint(deck, { placements: { resolve: async () => ({ kind: 'media', media, src }) } })
  expect(resolved.html).toContain(src)
  const missing = await preparedDeckValuePrint(deck, {})
  expect(missing.html).toContain(placementPlaceholderSource())
})
