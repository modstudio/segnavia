import { expect, test } from 'bun:test'
import { Deck, Page } from '@segnavia/format'
import { filledDeck, filledPage, filledPages } from './slot-fill.ts'

const slots = {
  declarations: [{ key: 'host.name', label: 'Host name', type: 'text' as const, required: true }],
  fill: { id: 'host', values: { 'host.name': 'Filled by host' } },
}

test('pagePdf, pageImage, pagesPdf, deckPdf and slideImage preparation honor host declarations', async () => {
  const page = Page.parse({ html: '<p data-slot-value="host.name">Design text</p>' })
  const filledPageResult = await filledPage(page, slots)
  expect(filledPageResult.html).toContain('Filled by host')

  const pages = [Page.parse({ html: '<p data-slot-value="host.name">Front</p>' }), Page.parse({ html: '<p data-slot-value="host.name">Back</p>' })]
  const filledCollection = await filledPages(pages, slots)
  expect(filledCollection.map((item) => item.html)).toEqual(['<p dir="auto">Filled by host</p>', '<p dir="auto">Filled by host</p>'])

  const deck = Deck.parse({
    title: 'Host slots',
    size: { width: 400, height: 200 },
    slides: [{ id: 'one', content: { kind: 'html', html: '<p data-slot-value="host.name">Design text</p>' } }],
  })
  const filledDeckResult = await filledDeck(deck, slots)
  expect(filledDeckResult.slides[0]?.content).toEqual({ kind: 'html', html: '<p dir="auto">Filled by host</p>' })
})

test('asset resolution receives the render abort signal', async () => {
  const controller = new AbortController()
  let received: AbortSignal | undefined
  const page = Page.parse({
    html: '<img data-slot-src="logo">',
    slots: [{ key: 'logo', label: 'Logo', type: 'image', required: false }],
  })
  await filledPage(
    page,
    {
      fill: { id: 'host', values: { logo: { asset: 'logo' } } },
      resolveAsset: async (_, options) => {
        received = options.signal
        return 'data:image/png;base64,AAAA'
      },
    },
    controller.signal,
  )
  expect(received).toBe(controller.signal)
})
