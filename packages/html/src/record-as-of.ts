import {
  type AsOfDay,
  type Book,
  type BookChapterEntry,
  type BookFrontMatterEntry,
  type Deck,
  isDesignedSection,
  isPart,
  isTemplatedSection,
} from '@segnavia/format'
import { fillAsOfBindings } from './as-of-bindings.ts'

type BookEntry = BookFrontMatterEntry | BookChapterEntry
type BookHtmlMapper = (html: string, entry?: BookEntry & { html: string }, slotFill?: boolean) => string

function mapBookEntry<T extends BookEntry>(entry: T, apply: BookHtmlMapper): T {
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
  if ('html' in entry) return { ...entry, html: apply(entry.html as string, entry as BookEntry & { html: string }) } as T
  return entry
}

function mapBookItems(items: Book['body'], apply: BookHtmlMapper): Book['body'] {
  return items.map((entry) => {
    if (!isPart(entry)) return mapBookEntry(entry, apply)
    return { ...entry, ...(entry.html === undefined ? {} : { html: apply(entry.html) }), children: mapBookItems(entry.children, apply) }
  })
}

/** Maps every HTML string carried by a book through one function. */
export function mapBookHtml(book: Book, apply: BookHtmlMapper): Book {
  return {
    ...book,
    frontMatter: mapBookItems(book.frontMatter, apply),
    body: mapBookItems(book.body, apply),
    endMatter: mapBookItems(book.endMatter, apply),
    templates: book.templates.map((template) => ({ ...template, html: apply(template.html) })),
    parentPages: book.parentPages.map((parent) => ({
      ...parent,
      regions: Object.fromEntries(Object.entries(parent.regions).map(([name, region]) => [name, { ...region, html: apply(region.html, undefined, false) }])),
    })),
  }
}

export function fillBookAsOfBindings(book: Book, day: AsOfDay): Book {
  return mapBookHtml(book, (html) => fillAsOfBindings(html, day))
}

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
