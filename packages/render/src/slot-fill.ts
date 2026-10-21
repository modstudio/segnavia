import type { Deck, Page, SlotsOptions } from '@segnavia/format'
import { prepareSlotCollection, prepareSlots } from '@segnavia/html'

export async function filledPage(page: Page, slots: SlotsOptions | undefined, signal?: AbortSignal): Promise<Page> {
  const prepared = await prepareSlots(page.slots, slots, signal)
  return { ...page, html: prepared.apply(page.html) }
}

export async function filledPages(pages: Page[], slots: SlotsOptions | undefined, signal?: AbortSignal): Promise<Page[]> {
  const prepared = await prepareSlotCollection(
    pages.map((page) => page.slots),
    slots,
    signal,
  )
  return pages.map((page) => ({ ...page, html: prepared.apply(page.html) }))
}

export async function filledDeck(deck: Deck, slots: SlotsOptions | undefined, signal?: AbortSignal): Promise<Deck> {
  const prepared = await prepareSlots(deck.slots, slots, signal)
  return {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.content.kind === 'html' ? { ...slide, content: { ...slide.content, html: prepared.apply(slide.content.html) } } : slide,
    ),
  }
}
