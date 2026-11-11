import {
  type AsOfDay,
  type Book,
  type BookChapterEntry,
  type BookFrontMatterEntry,
  type Deck,
  isDesignedSection,
  isPart,
  isTemplatedSection,
  type Page,
} from '@segnavia/format'
import {
  assertSingleSlotCopy,
  bindRecordValues,
  fillAsOfBindings,
  type HtmlPage,
  hasSlotWork,
  isPrintedHtmlPage,
  type PreparedSlots,
  type PrintedHtmlPage,
  prepareSlotCollection,
  prepareSlots,
  requiredSlotRefusal,
  resolvePageHtml,
  type SlotPrintOptions,
  slotFillRefusal,
} from '@segnavia/html'

export function fillDeckAsOfBindings(deck: Deck, day: AsOfDay): Deck {
  return {
    ...deck,
    slides: deck.slides.map((slide) =>
      'kind' in slide.content && slide.content.kind === 'html'
        ? { ...slide, content: { ...slide.content, html: fillAsOfBindings(slide.content.html, day) } }
        : slide,
    ),
  }
}

export function fillDeckForDay(deck: Deck, day: AsOfDay, slots: SlotPrintOptions | undefined, signal?: AbortSignal) {
  return filledDeck(fillDeckAsOfBindings(deck, day), slots, signal)
}

export function fillBookAsOfBindings(book: Book, day: AsOfDay): Book {
  const apply = (html: string) => fillAsOfBindings(html, day)
  return {
    ...book,
    frontMatter: mapBookItems(book.frontMatter, apply, false),
    body: mapBookItems(book.body, apply, false),
    endMatter: mapBookItems(book.endMatter, apply, false),
    templates: book.templates.map((template) => ({ ...template, html: apply(template.html) })),
    parentPages: book.parentPages.map((parent) => ({
      ...parent,
      regions: Object.fromEntries(Object.entries(parent.regions).map(([name, region]) => [name, { ...region, html: fillAsOfBindings(region.html, day) }])),
    })),
  }
}

function refuseRequired(prepared: PreparedSlots): void {
  const refusal = requiredSlotRefusal(prepared.declarations, prepared.report)
  if (refusal) throw refusal
}

export function filledPage(
  input: PrintedHtmlPage,
  slots: SlotPrintOptions | undefined,
  signal?: AbortSignal,
): Promise<{ value: PrintedHtmlPage; slots: PreparedSlots }>
export function filledPage(
  input: Page | HtmlPage,
  slots: SlotPrintOptions | undefined,
  signal?: AbortSignal,
): Promise<{ value: HtmlPage; slots: PreparedSlots }>
export function filledPage(
  input: Page | HtmlPage | PrintedHtmlPage,
  slots: SlotPrintOptions | undefined,
  signal?: AbortSignal,
): Promise<{ value: HtmlPage | PrintedHtmlPage; slots: PreparedSlots }>
export async function filledPage(
  input: Page | HtmlPage | PrintedHtmlPage,
  slots: SlotPrintOptions | undefined,
  signal?: AbortSignal,
): Promise<{ value: HtmlPage | PrintedHtmlPage; slots: PreparedSlots }> {
  if (isPrintedHtmlPage(input)) {
    assertSingleSlotCopy(slots)
    const refusal = slotFillRefusal(input.scripts, input.slots, slots)
    if (refusal) throw refusal
    const prepared = await prepareSlots(input.slots, slots, signal)
    refuseRequired(prepared)
    const sections = hasSlotWork(input.slots, slots)
      ? input.printedPages.sections.map((section) => {
          const bound = bindRecordValues(section)
          return { ...bound, html: prepared.apply(bound.html) }
        })
      : input.printedPages.sections
    return { value: { ...input, printedPages: { ...input.printedPages, sections } }, slots: prepared }
  }
  const page = 'html' in input ? input : resolvePageHtml(input)
  assertSingleSlotCopy(slots)
  const refusal = slotFillRefusal(page.scripts, page.slots, slots)
  if (refusal) throw refusal
  const prepared = await prepareSlots(page.slots, slots, signal)
  refuseRequired(prepared)
  const value = hasSlotWork(page.slots, slots) ? { ...page, html: prepared.apply(page.html) } : page
  return { value, slots: prepared }
}

export function filledPages(
  inputs: Array<Page | HtmlPage>,
  slots: SlotPrintOptions | undefined,
  signal?: AbortSignal,
): Promise<{ value: HtmlPage[]; slots: PreparedSlots; frameGroups: number[][] }>
export function filledPages(
  inputs: Array<Page | HtmlPage | PrintedHtmlPage>,
  slots: SlotPrintOptions | undefined,
  signal?: AbortSignal,
): Promise<{ value: Array<HtmlPage | PrintedHtmlPage>; slots: PreparedSlots; frameGroups: number[][] }>
export async function filledPages(
  inputs: Array<Page | HtmlPage | PrintedHtmlPage>,
  slots: SlotPrintOptions | undefined,
  signal?: AbortSignal,
): Promise<{ value: Array<HtmlPage | PrintedHtmlPage>; slots: PreparedSlots; frameGroups: number[][] }> {
  const pages = inputs.map((input) => (isPrintedHtmlPage(input) || 'html' in input ? input : resolvePageHtml(input)))
  assertSingleSlotCopy(slots)
  for (const page of pages) {
    const refusal = slotFillRefusal(page.scripts, page.slots, slots)
    if (refusal) throw refusal
  }
  const prepared = await prepareSlotCollection(
    pages.map((page) => page.slots),
    slots,
    signal,
  )
  refuseRequired(prepared)
  const frameGroups: number[][] = []
  const value = pages.some((page) => hasSlotWork(page.slots, slots))
    ? pages.map((page) => {
        const firstFrame = prepared.frames.length
        const filled = isPrintedHtmlPage(page)
          ? {
              ...page,
              printedPages: {
                ...page.printedPages,
                sections: page.printedPages.sections.map((section) => {
                  const bound = bindRecordValues(section)
                  return { ...bound, html: prepared.apply(bound.html) }
                }),
              },
            }
          : { ...page, html: prepared.apply(page.html) }
        frameGroups.push(Array.from({ length: prepared.frames.length - firstFrame }, (_, index) => firstFrame + index))
        return filled
      })
    : pages
  if (frameGroups.length === 0) pages.forEach(() => void frameGroups.push([]))
  return { value, slots: prepared, frameGroups }
}

export async function filledDeck(deck: Deck, slots: SlotPrintOptions | undefined, signal?: AbortSignal): Promise<{ value: Deck; slots: PreparedSlots }> {
  assertSingleSlotCopy(slots)
  const refusal = slotFillRefusal(deck.scripts, deck.slots, slots)
  if (refusal) throw refusal
  const prepared = await prepareSlots(deck.slots, slots, signal)
  refuseRequired(prepared)
  const value = hasSlotWork(deck.slots, slots)
    ? {
        ...deck,
        slides: deck.slides.map((slide) => {
          const html = 'kind' in slide.content && slide.content.kind === 'html' ? slide.content.html : ''
          // One application per slide keeps prepared.frames aligned with slide indices for slotsForFrames.
          const filledHtml = prepared.apply(html)
          if ('kind' in slide.content && slide.content.kind === 'html') {
            return { ...slide, content: { ...slide.content, html: filledHtml } }
          }
          return slide
        }),
      }
    : deck
  return { value, slots: prepared }
}

function fillEntry<T extends BookFrontMatterEntry | BookChapterEntry>(entry: T, apply: (html: string) => string, bind: boolean): T {
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
  if ('html' in entry) {
    const value = bind ? bindRecordValues(entry) : entry
    return { ...value, html: apply(value.html as string) } as T
  }
  return entry
}

function mapBookItems(items: Book['body'], apply: (html: string) => string, bind: boolean): Book['body'] {
  return items.map((entry) => {
    if (!isPart(entry)) return fillEntry(entry, apply, bind)
    return { ...entry, ...(entry.html === undefined ? {} : { html: apply(entry.html) }), children: mapBookItems(entry.children, apply, bind) }
  })
}

export async function filledBook(book: Book, slots: SlotPrintOptions | undefined, signal?: AbortSignal): Promise<{ value: Book; slots: PreparedSlots }> {
  assertSingleSlotCopy(slots)
  const refusal = slotFillRefusal(book.scripts, book.slots, slots)
  if (refusal) throw refusal
  const prepared = await prepareSlots(book.slots, slots, signal)
  refuseRequired(prepared)
  const value = hasSlotWork(book.slots, slots)
    ? {
        ...book,
        frontMatter: mapBookItems(book.frontMatter, prepared.apply, true),
        body: mapBookItems(book.body, prepared.apply, true),
        endMatter: mapBookItems(book.endMatter, prepared.apply, true),
        templates: book.templates.map((template) => ({ ...template, html: prepared.apply(template.html) })),
      }
    : book
  return { value, slots: prepared }
}

export function fillBookForDay(book: Book, day: AsOfDay, slots: SlotPrintOptions | undefined, signal?: AbortSignal) {
  return filledBook(fillBookAsOfBindings(book, day), slots, signal)
}

function bookItemFrameCount(items: Book['body']): number {
  return items.reduce((count, entry) => {
    if (isDesignedSection(entry)) return count + entry.pages.length
    if (isTemplatedSection(entry)) return count + entry.pages.reduce((total, page) => total + Object.keys(page.regions).length, 0)
    if (isPart(entry)) return count + (entry.html === undefined ? 0 : 1) + bookItemFrameCount(entry.children)
    return count + ('html' in entry ? 1 : 0)
  }, 0)
}

function frameRange(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, offset) => start + offset)
}

/** Frame membership for the documents printed from a filled book. */
export function bookSlotFrames(book: Book): { all: number[]; body: number[]; front: number[] } {
  const frontCount = bookItemFrameCount(book.frontMatter)
  const bodyCount = bookItemFrameCount(book.body)
  const endCount = bookItemFrameCount(book.endMatter)
  const templateCount = book.templates.length
  const bodyStart = frontCount
  const endStart = bodyStart + bodyCount
  const templateStart = endStart + endCount
  return {
    all: frameRange(0, templateStart + templateCount),
    front: frameRange(0, frontCount),
    body: frameRange(bodyStart, bodyCount + endCount),
  }
}
