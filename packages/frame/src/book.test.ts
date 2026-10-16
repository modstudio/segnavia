import { afterEach, describe, expect, test } from 'bun:test'
import { bookFrame, SegnaviaBook } from './book.ts'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function element() {
  const book = Object.create(SegnaviaBook.prototype) as SegnaviaBook
  let mounts = 0
  ;(book as unknown as { mount: () => void }).mount = () => mounts++
  return { book, mounts: () => mounts }
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
