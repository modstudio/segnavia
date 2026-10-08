import { describe, expect, test } from 'bun:test'
import { frameDocument, newNonce } from './bridge.ts'

describe('frame document', () => {
  test('the policy and the bridge come before anything the author wrote', () => {
    const html = frameDocument('<!doctype html><html><head><script>evil()</script></head><body>x</body></html>', { scripts: 'refuse', nonce: 'n1' })
    const policy = html.indexOf("script-src 'nonce-n1'")
    expect(policy).toBeGreaterThan(-1)
    expect(policy).toBeLessThan(html.indexOf('evil()'))
    expect(html.indexOf('<script nonce="n1">')).toBeLessThan(html.indexOf('evil()'))
    expect(html.match(/<!doctype/gi)?.length).toBe(1)
  })

  test('sandboxed scripts carry no script policy, so the author code runs', () => {
    expect(frameDocument('<p>x</p>', { scripts: 'sandboxed', nonce: 'n' })).not.toContain('script-src')
  })

  test('direction and language land on the root the author declared, or one we supply', () => {
    expect(frameDocument('<html lang="en"><body>x</body></html>', { scripts: 'refuse', nonce: 'n', dir: 'rtl' })).toContain('<html lang="en" dir="rtl">')
    expect(frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n', dir: 'rtl', lang: 'he' })).toContain('<html dir="rtl" lang="he"><body><p>x</p>')
  })

  test('block direction comes before the host style, so the host can override it', () => {
    const html = frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n', css: 'p{unicode-bidi:normal}' })
    expect(html.indexOf('unicode-bidi:plaintext')).toBeLessThan(html.indexOf('p{unicode-bidi:normal}'))
  })

  test('nonces are unguessable and never repeat', () => {
    const a = newNonce()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(newNonce()).not.toBe(a)
  })
})
