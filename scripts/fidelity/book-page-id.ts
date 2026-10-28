export function bookPageId(bookId: string, page: number): string {
  if (!Number.isInteger(page) || page < 1) throw new Error(`A book page id needs a positive integer page; received ${String(page)}.`)
  return `${bookId}/p${String(page).padStart(2, '0')}`
}
