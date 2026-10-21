import type { Deck, Page, SlotsOptions } from '@segnavia/format'
import { hasSlotWork, prepareSlotCollection, prepareSlots, requiredSlotRefusal, slotFillRefusal } from '@segnavia/html'

function refuseRequired(prepared: Awaited<ReturnType<typeof prepareSlots>>): void {
  const refusal = requiredSlotRefusal(prepared.declarations, prepared.report)
  if (refusal) throw refusal
}

export async function filledPage(page: Page, slots: SlotsOptions | undefined, signal?: AbortSignal): Promise<Page> {
  const refusal = slotFillRefusal(page.scripts, page.slots, slots)
  if (refusal) throw refusal
  if (!hasSlotWork(page.slots, slots)) return page
  const prepared = await prepareSlots(page.slots, slots, signal)
  refuseRequired(prepared)
  return { ...page, html: prepared.apply(page.html) }
}

export async function filledPages(pages: Page[], slots: SlotsOptions | undefined, signal?: AbortSignal): Promise<Page[]> {
  for (const page of pages) {
    const refusal = slotFillRefusal(page.scripts, page.slots, slots)
    if (refusal) throw refusal
  }
  if (!pages.some((page) => hasSlotWork(page.slots, slots))) return pages
  const prepared = await prepareSlotCollection(
    pages.map((page) => page.slots),
    slots,
    signal,
  )
  refuseRequired(prepared)
  return pages.map((page) => ({ ...page, html: prepared.apply(page.html) }))
}

export async function filledDeck(deck: Deck, slots: SlotsOptions | undefined, signal?: AbortSignal): Promise<Deck> {
  const refusal = slotFillRefusal(deck.scripts, deck.slots, slots)
  if (refusal) throw refusal
  if (!hasSlotWork(deck.slots, slots)) return deck
  const prepared = await prepareSlots(deck.slots, slots, signal)
  refuseRequired(prepared)
  return {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.content.kind === 'html' ? { ...slide, content: { ...slide.content, html: prepared.apply(slide.content.html) } } : slide,
    ),
  }
}
