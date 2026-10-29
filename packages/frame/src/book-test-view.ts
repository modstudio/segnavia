import type { BookViewInput } from '@segnavia/format'
import { SegnaviaBook } from './book.ts'

export function reflectedBookElement() {
  const book = new SegnaviaBook()
  const attributes = new Map<string, string>()
  ;(book as unknown as { querySelector: () => null }).querySelector = () => null
  ;(book as unknown as { setAttribute: (name: string, value: string) => void }).setAttribute = (name, value) => {
    const previous = attributes.get(name) ?? null
    attributes.set(name, value)
    void book.attributeChangedCallback(name, previous, value)
  }
  ;(book as unknown as { removeAttribute: (name: string) => void }).removeAttribute = (name) => {
    const previous = attributes.get(name) ?? null
    attributes.delete(name)
    void book.attributeChangedCallback(name, previous, null)
  }
  ;(book as unknown as { hasAttribute: (name: string) => boolean }).hasAttribute = (name) => attributes.has(name)
  return { book, attributes }
}

export function switchableBookView(): BookViewInput {
  return {
    html: '<style></style><main data-segnavia-galleys></main>',
    flow: '<style></style><main data-segnavia-flow="chapter"></main>',
    pagination: {
      paper: { width: 148, height: 210 },
      margin: { top: 12, bottom: 12, inner: 15, outer: 10 },
      columnGap: 4,
      direction: 'ltr',
      numbering: { frontMatter: 'roman-lower', body: 'arabic' },
      rectoOpenings: false,
      orphans: 2,
      widows: 2,
      parents: [],
      endnotePlacement: 'book',
      contents: { pageNumbers: true, depth: 2 },
      runningHead: { recto: 'title', verso: 'title' },
    },
  }
}
