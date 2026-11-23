import { afterAll, beforeAll, expect, test } from 'bun:test'
import type { ServedFrameDocument } from './frame-write.ts'
import { FramePoolTestElement, installFramePoolTestDocument } from './frame-pool.test-helper.ts'

let restoreDocument = () => {}
const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
beforeAll(() => {
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class extends EventTarget {} })
  restoreDocument = installFramePoolTestDocument()
})
afterAll(() => {
  restoreDocument()
  if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
  else Reflect.deleteProperty(globalThis, 'HTMLElement')
})

const html =
  '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src \'none\'"></head><body>Frame</body></html>'

test('the page writer passes page documents to its serving seam', async () => {
  const { SegnaviaPage } = await import('./page.ts')
  let received: ServedFrameDocument | undefined
  const page = Object.create(SegnaviaPage.prototype) as SegnaviaPage
  Object.assign(page, { documentWrites: 0, loadGeneration: 0 })
  Object.defineProperty(page, 'serveFrame', {
    value: (document: ServedFrameDocument) => {
      received = document
      return '/frames/page'
    },
  })
  const frame = new FramePoolTestElement('iframe') as unknown as HTMLIFrameElement

  ;(page as unknown as { writeDocument(frame: HTMLIFrameElement, srcdoc: string, provisional: boolean, layouts: boolean): void }).writeDocument(
    frame,
    html,
    false,
    false,
  )
  await Promise.resolve()

  expect(received?.kind).toBe('page')
  expect(frame.src).toBe('https://frames.example/frames/page')
})

test('the book writer passes book documents to its serving seam', async () => {
  const { SegnaviaBook } = await import('./book.ts')
  let received: ServedFrameDocument | undefined
  const book = Object.create(SegnaviaBook.prototype) as SegnaviaBook
  Object.assign(book, { loadGeneration: 0 })
  book.serveFrame = (document) => {
    received = document
    return '/frames/book'
  }

  const frame = (
    book as unknown as {
      mountFrame(rendered: { title: string; srcdoc: string; scripts: 'refuse' }, layout?: null): HTMLIFrameElement
    }
  ).mountFrame({ title: 'Book', srcdoc: html, scripts: 'refuse' })
  await Promise.resolve()

  expect(received?.kind).toBe('book')
  expect(frame.src).toBe('https://frames.example/frames/book')
})
