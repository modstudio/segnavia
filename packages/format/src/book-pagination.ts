import type { Book, BookViewPagination } from './book.ts'
import { bookPageGeometries } from './book-page-geometry.ts'
import { bookSections } from './book-section.ts'
import { resolveDirection } from './direction.ts'
import { sheetMm } from './paper.ts'
import { bookParents } from './printed-pages.ts'
import { bookVariableDocumentFacts, variableReadsDocumentFacts } from './variable-document-facts.ts'

/** Resolves the browser composition settings for a paginated book. */
export function resolveBookPagination(book: Book): BookViewPagination | undefined {
  if (book.mode !== 'paginated' || !book.page) return undefined
  return {
    paper: sheetMm(book.page),
    margin: book.page.margin,
    columnGap: book.page.columnGap,
    geometries: bookPageGeometries(book),
    direction: resolveDirection(book.dir, book.lang, book.title),
    numbering: book.numbering,
    rectoOpenings: book.rectoOpenings,
    orphans: book.orphans,
    widows: book.widows,
    parents: bookParents(book.page.margin, book.parentPages),
    endnotePlacement: book.endnotes.placement,
    contents: book.contents,
    variables: book.variables,
    headTemplates: book.headTemplates,
    ...(book.lineNumbers === undefined ? {} : { lineNumbers: book.lineNumbers }),
    ...(book.sideNotes === undefined ? {} : { sideNotes: book.sideNotes }),
    ...(book.notes.some(({ key }) => key === 'line')
      ? {
          lineNoteSeries: book.notes.flatMap(({ key, name, lineNumberSystem }) =>
            key === 'line' && lineNumberSystem ? [{ name, system: lineNumberSystem }] : [],
          ),
        }
      : {}),
    recordSlotsByFlow: Object.fromEntries(bookSections(book).flatMap(({ entry }) => ('values' in entry && entry.values ? [[entry.id, entry.values]] : []))),
    ...(book.variables.some(variableReadsDocumentFacts) ? { document: bookVariableDocumentFacts(book) } : {}),
  }
}
