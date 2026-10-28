import { type Book, type BookChapterEntry, type BookFrontMatterEntry, type Deck, isDesignedSection, isTemplatedSection, type Page } from '@segnavia/format'
import {
  assertSingleSlotCopy,
  hasSlotWork,
  prepareSlotCollection,
  prepareSlots,
  requiredSlotRefusal,
  type SlotPrintOptions,
  slotFillRefusal,
} from '@segnavia/html'

const preparations = new WeakMap<object, Awaited<ReturnType<typeof prepareSlots>>>()

export function preparedSlotsFor(value: object): Awaited<ReturnType<typeof prepareSlots>> | undefined {
  return preparations.get(value)
}

function refuseRequired(prepared: Awaited<ReturnType<typeof prepareSlots>>): void {
  const refusal = requiredSlotRefusal(prepared.declarations, prepared.report)
  if (refusal) throw refusal
}

export async function filledPage(page: Page, slots: SlotPrintOptions | undefined, signal?: AbortSignal): Promise<Page> {
  assertSingleSlotCopy(slots)
  const refusal = slotFillRefusal(page.scripts, page.slots, slots)
  if (refusal) throw refusal
  if (!hasSlotWork(page.slots, slots)) return page
  const prepared = await prepareSlots(page.slots, slots, signal)
  refuseRequired(prepared)
  const filled = { ...page, html: prepared.apply(page.html) }
  preparations.set(filled, prepared)
  return filled
}

export async function filledPages(pages: Page[], slots: SlotPrintOptions | undefined, signal?: AbortSignal): Promise<Page[]> {
  assertSingleSlotCopy(slots)
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
  return pages.map((page) => {
    const filled = { ...page, html: prepared.apply(page.html) }
    preparations.set(filled, prepared)
    return filled
  })
}

export async function filledDeck(deck: Deck, slots: SlotPrintOptions | undefined, signal?: AbortSignal): Promise<Deck> {
  assertSingleSlotCopy(slots)
  const refusal = slotFillRefusal(deck.scripts, deck.slots, slots)
  if (refusal) throw refusal
  if (!hasSlotWork(deck.slots, slots)) return deck
  const prepared = await prepareSlots(deck.slots, slots, signal)
  refuseRequired(prepared)
  const filled = {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.content.kind === 'html' ? { ...slide, content: { ...slide.content, html: prepared.apply(slide.content.html) } } : slide,
    ),
  }
  preparations.set(filled, prepared)
  return filled
}

function fillEntry<T extends BookFrontMatterEntry | BookChapterEntry>(entry: T, apply: (html: string) => string): T {
  if (isDesignedSection(entry)) return { ...entry, pages: entry.pages.map((page) => ({ ...page, html: apply(page.html) })) }
  if (isTemplatedSection(entry)) {
    return {
      ...entry,
      pages: entry.pages.map((page) => ({
        ...page,
        regions: Object.fromEntries(Object.entries(page.regions).map(([key, html]) => [key, apply(html)])),
      })),
    }
  }
  if ('html' in entry) return { ...entry, html: apply(entry.html) }
  return entry
}

export async function filledBook(book: Book, slots: SlotPrintOptions | undefined, signal?: AbortSignal): Promise<Book> {
  assertSingleSlotCopy(slots)
  const refusal = slotFillRefusal(book.scripts, book.slots, slots)
  if (refusal) throw refusal
  if (!hasSlotWork(book.slots, slots)) return book
  const prepared = await prepareSlots(book.slots, slots, signal)
  refuseRequired(prepared)
  const filled = {
    ...book,
    frontMatter: book.frontMatter.map((entry) => fillEntry(entry, prepared.apply)),
    chapters: book.chapters.map((entry) => fillEntry(entry, prepared.apply)),
    templates: book.templates.map((template) => ({ ...template, html: prepared.apply(template.html) })),
  }
  // One book document reports each key once, so marks are per rendered tab, not per applied field.
  const marked = prepared.marked as Map<string, number>
  for (const key of marked.keys()) marked.set(key, 1)
  preparations.set(filled, prepared)
  return filled
}
