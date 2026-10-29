import type { BookViewInput } from '@segnavia/format'
import { SegnaviaBook } from './book.ts'

export function reflectedBookElement() {
  const book = new SegnaviaBook()
  const attributes = new Map<string, string>()
  const frames: Array<HTMLIFrameElement & { srcdoc: string }> = []
  ;(book as unknown as { mountFrame: (rendered: { title: string; srcdoc: string }, layout?: string | null) => HTMLIFrameElement }).mountFrame = (
    rendered,
    layout = null,
  ) =>
    ({
      ...rendered,
      dataset: layout ? { segnaviaBookLayout: layout } : {},
      hidden: false,
      style: {},
      contentWindow: { postMessage() {} },
      setAttribute() {},
    }) as unknown as HTMLIFrameElement
  ;(book as unknown as { replaceChildren: (...held: HTMLIFrameElement[]) => void }).replaceChildren = (...held) => frames.splice(0, frames.length, ...held)
  ;(book as unknown as { append: (held: HTMLIFrameElement) => void }).append = (held) => frames.push(held)
  ;(book as unknown as { querySelector: (selector: string) => HTMLIFrameElement | null }).querySelector = (selector) => {
    const layout = selector.match(/data-segnavia-book-layout="(pages|flow)"/)?.[1]
    return frames.find((frame) => !layout || frame.dataset.segnaviaBookLayout === layout) ?? null
  }
  ;(book as unknown as { querySelectorAll: () => HTMLIFrameElement[] }).querySelectorAll = () => frames
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
  return { book, attributes, frames }
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
