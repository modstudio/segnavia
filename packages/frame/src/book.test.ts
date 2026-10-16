import { afterEach, describe, expect, test } from 'bun:test'
import { bookFrame, SegnaviaBook } from './book.ts'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function element() {
  const book = new SegnaviaBook()
  let mounts = 0
  let clears = 0
  ;(book as unknown as { mount: () => void }).mount = () => mounts++
  ;(book as unknown as { replaceChildren: () => void }).replaceChildren = () => clears++
  return { book, mounts: () => mounts, clears: () => clears }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('book element input', () => {
  test('the view property parses and rebuilds the frame', () => {
    const { book, mounts } = element()
    book.view = { html: '<main>שלום</main>', lang: 'he' }
    expect(book.view).toEqual({ html: '<main>שלום</main>', lang: 'he', scripts: 'refuse' })
    expect(mounts()).toBe(1)

    book.view = { html: '<main>Second</main>', title: 'Named book' }
    expect(book.view?.title).toBe('Named book')
    expect(mounts()).toBe(2)
  })

  test('the src attribute fetches, parses and rebuilds a view', async () => {
    const requested: string[] = []
    globalThis.fetch = (async (input) => {
      requested.push(String(input))
      return Response.json({ html: '<main>Fetched</main>', title: 'Fetched book' })
    }) as typeof fetch
    const { book, mounts } = element()
    await book.attributeChangedCallback('src', null, 'https://example.test/book.json')
    expect(requested).toEqual(['https://example.test/book.json'])
    expect(book.view?.title).toBe('Fetched book')
    expect(mounts()).toBe(1)
  })

  test('a slower old src cannot replace the latest src', async () => {
    const a = deferred<Response>()
    const b = deferred<Response>()
    globalThis.fetch = ((input) => (String(input).endsWith('/a.json') ? a.promise : b.promise)) as typeof fetch
    const { book, mounts } = element()
    const loadingA = book.attributeChangedCallback('src', null, 'https://example.test/a.json')
    const loadingB = book.attributeChangedCallback('src', 'https://example.test/a.json', 'https://example.test/b.json')
    b.resolve(Response.json({ html: '<main>B</main>', title: 'B' }))
    await loadingB
    a.resolve(Response.json({ html: '<main>A</main>', title: 'A' }))
    await loadingA
    expect(book.view?.title).toBe('B')
    expect(mounts()).toBe(1)
  })

  test('a view assignment cannot be replaced by an older src', async () => {
    const response = deferred<Response>()
    globalThis.fetch = (() => response.promise) as unknown as typeof fetch
    const { book, mounts } = element()
    const loading = book.attributeChangedCallback('src', null, 'https://example.test/book.json')
    book.view = { html: '<main>Property</main>', title: 'Property' }
    response.resolve(Response.json({ html: '<main>Fetched</main>', title: 'Fetched' }))
    await loading
    expect(book.view?.title).toBe('Property')
    expect(mounts()).toBe(1)
  })

  test('removing src clears its view and frame', async () => {
    globalThis.fetch = (async () => Response.json({ html: '<main>Fetched</main>' })) as unknown as typeof fetch
    const { book, clears } = element()
    await book.attributeChangedCallback('src', null, 'https://example.test/book.json')
    await book.attributeChangedCallback('src', 'https://example.test/book.json', null)
    expect(book.view).toBeNull()
    expect(clears()).toBe(1)
  })

  test('a failed fetch fires error with its message', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch
    const { book } = element()
    let detail: unknown
    ;(book as unknown as { dispatchEvent: (event: Event) => boolean }).dispatchEvent = (event) => {
      detail = (event as CustomEvent).detail
      return true
    }
    await book.attributeChangedCallback('src', null, 'https://example.test/book.json')
    expect(detail).toEqual({ message: 'The book at https://example.test/book.json answered 503.' })
  })

  test('the frame description uses book direction, security policy and labels', () => {
    const hebrew = bookFrame({ html: '<main>שלום</main>', lang: 'he', scripts: 'refuse' })
    expect(hebrew.title).toBe('ספר')
    expect(hebrew.srcdoc).toContain('<html dir="rtl" lang="he">')
    expect(hebrew.srcdoc).toContain("script-src 'nonce-")
    expect(hebrew.srcdoc).not.toContain('segnavia:height')

    const named = bookFrame({ html: '<main>Book</main>', title: 'Named book', scripts: 'sandboxed' })
    expect(named.title).toBe('Named book')
    expect(named.srcdoc).not.toContain("script-src 'nonce-")
  })
})
