import {
  type AsOfDay,
  type Book,
  type BookChapterEntry,
  type BookFrontMatterEntry,
  type BookView,
  type Deck,
  isDesignedSection,
  isPart,
  isTemplatedSection,
} from '@segnavia/format'
import { fillAsOfBindings } from './as-of-bindings.ts'
import { bindRecordValues } from './record-values.ts'

type BookEntry = BookFrontMatterEntry | BookChapterEntry
type BookHtmlMapper = (html: string) => string

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
  if ('html' in entry) return { ...entry, html: apply(entry.html as string) } as T
  return entry
}

function mapBookItems(items: Book['body'], applyEntry: (entry: BookEntry) => BookEntry, applyPartHtml: BookHtmlMapper): Book['body'] {
  return items.map((entry) => {
    if (!isPart(entry)) return applyEntry(entry)
    return {
      ...entry,
      ...(entry.html === undefined ? {} : { html: applyPartHtml(entry.html) }),
      children: mapBookItems(entry.children, applyEntry, applyPartHtml),
    }
  })
}

function mapBookEntries(book: Book, applyEntry: (entry: BookEntry) => BookEntry, applyPartHtml: BookHtmlMapper = (html) => html): Book {
  return {
    ...book,
    frontMatter: mapBookItems(book.frontMatter, applyEntry, applyPartHtml),
    body: mapBookItems(book.body, applyEntry, applyPartHtml),
    endMatter: mapBookItems(book.endMatter, applyEntry, applyPartHtml),
  }
}

/** Maps section, part and template HTML carried by a book through one function. */
export function mapBookHtml(book: Book, apply: BookHtmlMapper): Book {
  return {
    ...mapBookEntries(book, (entry) => mapBookEntry(entry, apply), apply),
    templates: book.templates.map((template) => ({ ...template, html: apply(template.html) })),
  }
}

export function bindBookRecordValues(book: Book): Book {
  return mapBookEntries(book, (entry) => ('html' in entry ? (bindRecordValues(entry) as BookEntry) : entry))
}

export function fillBookAsOfBindings(book: Book, day: AsOfDay): Book {
  const filled = mapBookHtml(book, (html) => fillAsOfBindings(html, day))
  return {
    ...filled,
    parentPages: book.parentPages.map((parent) => ({
      ...parent,
      regions: Object.fromEntries(Object.entries(parent.regions).map(([name, region]) => [name, { ...region, html: fillAsOfBindings(region.html, day) }])),
    })),
  }
}

/** Fills every author-HTML string carried by a lowered book view. */
export function fillBookViewAsOfBindings(view: BookView, day: AsOfDay): BookView {
  return {
    ...view,
    html: fillAsOfBindings(view.html, day),
    ...(view.flow === undefined ? {} : { flow: fillAsOfBindings(view.flow, day) }),
    ...(view.pagination === undefined
      ? {}
      : {
          pagination: {
            ...view.pagination,
            parents: view.pagination.parents.map((parent) => ({
              ...parent,
              regions: Object.fromEntries(
                Object.entries(parent.regions).map(([name, region]) => [name, { ...region, html: fillAsOfBindings(region.html, day) }]),
              ),
            })),
          },
        }),
  }
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
