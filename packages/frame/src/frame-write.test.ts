import { describe, expect, test } from 'bun:test'
import { writeFrameDocument } from './frame-write.ts'

const html = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src \'none\'; img-src data:"></head></html>'
class TestFrame {
  ownerDocument = { baseURI: 'https://frames.example/base/' } as Document
  src = ''
  srcdoc = ''
  private attributes = new Set<string>()
  setAttribute(name: string) {
    this.attributes.add(name)
  }
  removeAttribute(name: string) {
    this.attributes.delete(name)
    if (name === 'srcdoc') this.srcdoc = ''
  }
  hasAttribute(name: string) {
    return this.attributes.has(name)
  }
}
const frame = () => new TestFrame() as unknown as HTMLIFrameElement

describe('writeFrameDocument', () => {
  test('writes srcdoc by default', async () => {
    const iframe = frame()
    await writeFrameDocument(iframe, html, 'page')
    expect(iframe.srcdoc).toBe(html)
  })

  test('passes the document and writes a served URL', async () => {
    const iframe = frame()
    let received: unknown
    await writeFrameDocument(iframe, html, 'slide', (document) => {
      received = document
      return '/frames/one'
    })
    expect(received).toEqual({ html, policy: "script-src 'none'; img-src data:", kind: 'slide' })
    expect(iframe.src).toBe('https://frames.example/frames/one')
    expect(iframe.hasAttribute('srcdoc')).toBe(false)
  })

  test('discards a served URL superseded by a newer write', async () => {
    const iframe = frame()
    let resolve!: (url: string) => void
    const first = writeFrameDocument(iframe, html, 'page', () => new Promise((done) => (resolve = done)))
    await writeFrameDocument(iframe, html.replace('data:', 'blob:'), 'page')
    resolve('/frames/stale')
    expect(await first).toBe(false)
    expect(iframe.srcdoc).toContain('blob:')
  })

  test.each([
    ['a rejection', () => Promise.reject(new Error('store unavailable'))],
    ['a javascript URL', () => 'javascript:alert(1)'],
    ['a data URL', () => 'data:text/html,no'],
  ])('refuses %s with the clearing action', async (_, serve) => {
    await expect(writeFrameDocument(frame(), html, 'book', serve)).rejects.toThrow(
      /serveFrame.*make serveFrame resolve to an HTTP\(S\) URL to clear this refusal/,
    )
  })
})
