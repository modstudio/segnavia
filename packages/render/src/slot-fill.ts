import type { Deck, Page, SlotsOptions } from '@segnavia/format'
import { hasSlotWork, prepareSlotCollection, prepareSlots, slotFillRefusal } from '@segnavia/html'

export async function filledPage(page: Page, slots: SlotsOptions | undefined, signal?: AbortSignal): Promise<Page> {
  const work = hasSlotWork(page.slots, slots)
  const refusal = slotFillRefusal(page.scripts, work)
  if (refusal) throw refusal
  if (!work) return page
  const prepared = await prepareSlots(page.slots, slots, signal)
  return { ...page, html: prepared.apply(page.html) }
}

export async function filledPages(pages: Page[], slots: SlotsOptions | undefined, signal?: AbortSignal): Promise<Page[]> {
  const work = pages.map((page) => hasSlotWork(page.slots, slots))
  for (const [index, page] of pages.entries()) {
    const refusal = slotFillRefusal(page.scripts, work[index] ?? false)
    if (refusal) throw refusal
  }
  if (!work.some(Boolean)) return pages
  const prepared = await prepareSlotCollection(
    pages.map((page) => page.slots),
    slots,
    signal,
  )
  return pages.map((page) => ({ ...page, html: prepared.apply(page.html) }))
}

export async function filledDeck(deck: Deck, slots: SlotsOptions | undefined, signal?: AbortSignal): Promise<Deck> {
  const work = hasSlotWork(deck.slots, slots)
  const refusal = slotFillRefusal(deck.scripts, work)
  if (refusal) throw refusal
  if (!work) return deck
  const prepared = await prepareSlots(deck.slots, slots, signal)
  return {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.content.kind === 'html' ? { ...slide, content: { ...slide.content, html: prepared.apply(slide.content.html) } } : slide,
    ),
  }
}
