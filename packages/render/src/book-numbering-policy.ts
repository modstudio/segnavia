import { type Book, bookSections } from '@segnavia/format'

export function continuousSectionNumberingRefusal(book: Book): string | undefined {
  if (book.mode === 'paginated') return undefined
  const numbered = bookSections(book).find(({ entry }) => 'numbering' in entry && entry.numbering !== undefined)
  if (!numbered) return undefined
  const label = numbered.entry.title ?? numbered.id
  return `Section "${label}" (${numbered.id}) sets numbering, but continuous book printing cannot apply section numbering; use the paginated layout or remove numbering from section "${label}" to clear this refusal.`
}
