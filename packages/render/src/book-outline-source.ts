import { type Book, type OutlineSource, resolveDirection } from '@segnavia/format'
import { type BookHeading, headingLabel } from '@segnavia/html'

export function bookOutlineSource(book: Book, headings: BookHeading[]): OutlineSource {
  return {
    direction: resolveDirection(book.dir, book.lang, book.title),
    depth: book.outline.depth,
    headings: headings.map((heading) => ({
      id: heading.id,
      title: headingLabel(heading),
      level: heading.level + (heading.depth ?? 0),
      listed: heading.listed,
      block: heading.block,
    })),
    blocks: headings.map((heading) => heading.block),
  }
}
