import { afterAll, beforeAll, expect, test } from 'bun:test'
import { FramePoolTestElement, installFramePoolTestDocument } from './frame-pool.test-helper.ts'
import type { ServedFrameDocument } from './frame-write.ts'

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

const html = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src \'none\'"></head><body>Frame</body></html>'

test('the page writer passes page documents to its serving seam', async () => {
  const { SegnaviaPage } = await import('./page.ts')
  let received: ServedFrameDocument | undefined
  const page = Object.create(SegnaviaPage.prototype) as InstanceType<typeof SegnaviaPage>
  Object.assign(page, { documentWrites: 0, loadGeneration: 0 })
  Object.defineProperty(page, 'serveFrame', {
    value: (document: ServedFrameDocument) => {
      received = document
      return '/frames/page'
    },
  })
  const frame = new FramePoolTestElement('iframe') as unknown as HTMLIFrameElement

  ;(page as unknown as { writeDocument(frame: HTMLIFrameElement, html: string, provisional: boolean, layouts: boolean, policy: string): void }).writeDocument(
    frame,
    html,
    false,
    false,
    "script-src 'none'",
  )
  await Promise.resolve()

  expect(received?.kind).toBe('page')
  expect(frame.src).toBe('https://frames.example/frames/page')
})

test('a page reports a serving rejection through its existing error event', async () => {
  const { SegnaviaPage } = await import('./page.ts')
  const page = Object.create(SegnaviaPage.prototype) as InstanceType<typeof SegnaviaPage>
  Object.assign(page, { documentWrites: 0, loadGeneration: 0 })
  Object.defineProperty(page, 'serveFrame', { value: () => Promise.reject(new Error('store unavailable')) })
  let message = ''
  Object.defineProperty(page, 'dispatchEvent', {
    value: (event: ErrorEvent) => {
      message = event.message
      return true
    },
  })
  const frame = new FramePoolTestElement('iframe') as unknown as HTMLIFrameElement

  ;(page as unknown as { writeDocument(frame: HTMLIFrameElement, html: string, provisional: boolean, layouts: boolean, policy: string): void }).writeDocument(
    frame,
    html,
    false,
    false,
    "script-src 'none'",
  )
  await Promise.resolve()
  await Promise.resolve()

  expect(message).toContain('serveFrame rejected: store unavailable')
  expect(message).toContain('make serveFrame resolve to an HTTP(S) URL to clear this refusal')
})

test('the book writer passes book documents to its serving seam', async () => {
  const { SegnaviaBook } = await import('./book.ts')
  let received: ServedFrameDocument | undefined
  const book = Object.create(SegnaviaBook.prototype) as InstanceType<typeof SegnaviaBook>
  Object.assign(book, { loadGeneration: 0 })
  book.serveFrame = (document: ServedFrameDocument) => {
    received = document
    return '/frames/book'
  }

  const frame = (
    book as unknown as {
      mountFrame(rendered: { title: string; srcdoc: string; policy: string; scripts: 'refuse' }, layout?: null): HTMLIFrameElement
    }
  ).mountFrame({ title: 'Book', srcdoc: html, policy: "script-src 'none'", scripts: 'refuse' })
  await Promise.resolve()

  expect(received?.kind).toBe('book')
  expect(frame.src).toBe('https://frames.example/frames/book')
})
