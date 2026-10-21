import { describe, expect, test } from 'bun:test'
import { bridgeForHost, frameDocument, MESSAGE, newNonce, RELAYED_KEYS } from './bridge.ts'

describe('frame document', () => {
  test('relays viewer and presentation shortcuts', () => {
    expect(RELAYED_KEYS).toEqual(expect.arrayContaining(['m', 'c', 'f']))
  })
  test('does not relay letter shortcuts from editable targets', () => {
    let onKey: ((event: { key: string; target: unknown }) => void) | undefined
    const messages: unknown[] = []
    const document = {
      addEventListener: (name: string, listener: typeof onKey) => {
        if (name === 'keydown') onKey = listener
      },
      fonts: null,
      images: [],
      readyState: 'loading',
    }
    const parent = { postMessage: (message: unknown) => messages.push(message) }
    const window = { addEventListener: () => {} }
    Function('document', 'parent', 'window', bridgeForHost({ reportHeight: false }))(document, parent, window)
    onKey?.({ key: 'c', target: { tagName: 'SELECT', isContentEditable: false } })
    expect(messages).toEqual([])
  })
  test('the policy and the bridge come before anything the author wrote', () => {
    const html = frameDocument('<!doctype html><html><head><script>evil()</script></head><body>x</body></html>', { scripts: 'refuse', nonce: 'n1' })
    const policy = html.indexOf("script-src 'nonce-n1'")
    expect(policy).toBeGreaterThan(-1)
    expect(policy).toBeLessThan(html.indexOf('evil()'))
    expect(html.indexOf('<script nonce="n1">')).toBeLessThan(html.indexOf('evil()'))
    expect(html.match(/<!doctype/gi)?.length).toBe(1)
  })

  test('sandboxed scripts carry no script policy, so the author code runs', () => {
    const html = frameDocument('<p>x</p>', { scripts: 'sandboxed', nonce: 'n' })
    expect(html).not.toContain('script-src')
    expect(html).not.toContain('segnavia:print')
  })

  test('the bridge handles in-page links without expanding its message surface or policy', () => {
    const html = frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n' })
    expect(html).toContain("window.addEventListener('click'")
    expect(html).toContain("href.charAt(0)!=='#'")
    expect(html).not.toMatch(/fragment=decodeURIComponent/)
    expect(html.match(/decodeURIComponent/g)).toHaveLength(1)
    expect(html).toContain('try{return decodeURIComponent(run);}catch(error){return run;}')
    expect([...html.matchAll(/post\(\{type:'([^']+)'/g)].map((match) => match[1])).toEqual([MESSAGE.key, MESSAGE.height, MESSAGE.ready])
    expect(html).toContain(
      "<meta http-equiv=\"Content-Security-Policy\" content=\"script-src 'nonce-n'; object-src 'none'; base-uri 'none'; form-action 'none'\">",
    )
  })

  test('direction and language land on the root the author declared, or one we supply', () => {
    expect(frameDocument('<html lang="en"><body>x</body></html>', { scripts: 'refuse', nonce: 'n', dir: 'rtl' })).toContain('<html lang="en" dir="rtl">')
    expect(frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n', dir: 'rtl', lang: 'he' })).toContain('<html dir="rtl" lang="he"><body><p>x</p>')
  })

  test('block direction comes before the host style, so the host can override it', () => {
    const html = frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n', css: 'p{unicode-bidi:normal}' })
    expect(html.indexOf('unicode-bidi:plaintext')).toBeLessThan(html.indexOf('p{unicode-bidi:normal}'))
  })

  test('print documents lift root backgrounds and wait for CSS background images', () => {
    const html = frameDocument('<html><body>print</body></html>', { scripts: 'refuse', nonce: 'n', printBackground: true })
    expect(html).toContain('data-segnavia-print-background')
    expect(html).toContain("root.style.isolation='isolate'")
    expect(html).toContain('imgs=imgs.concat(backgroundImages())')
    expect(html).toContain("settle(elements[i],'::before')")
    expect(html).toContain('data-segnavia-print-background-image')
  })

  test('nonces are unguessable and never repeat', () => {
    const a = newNonce()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(newNonce()).not.toBe(a)
  })
})
