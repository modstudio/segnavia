import { describe, expect, test } from 'bun:test'
import { Shot } from '@segnavia/format'
import { comparableContent, sameContent } from './content-value.ts'

const shot = Shot.parse({
  key: 'slide',
  title: 'Slide',
  file: 'slide.png',
  size: { width: 1280, height: 720 },
  scale: 1,
  annotations: [],
  capturedAt: 'now',
})

describe('resolved content values', () => {
  test('matches equal values rather than object identity', () => {
    const value = (html: string, scripts: 'refuse' | 'sandboxed' = 'refuse', css = '', cspExtra = '') =>
      comparableContent({ kind: 'html', html }, (path) => path, scripts, css, cspExtra)
    expect(sameContent(value('<p>same</p>'), value('<p>same</p>'))).toBe(true)
    expect(sameContent(value('<p>before</p>'), value('<p>after</p>'))).toBe(false)
    expect(sameContent(value('<p>same</p>'), value('<p>same</p>', 'sandboxed'))).toBe(false)
    expect(sameContent(value('<p>same</p>'), value('<p>same</p>', 'refuse', 'p{color:red}'))).toBe(false)
    expect(sameContent(value('<p>same</p>'), value('<p>same</p>', 'refuse', '', "img-src 'none'"))).toBe(false)
    expect(
      sameContent(
        comparableContent({ kind: 'html', html: '<p>same</p>' }, (path) => path, 'refuse', '', '', ['https://one.example']),
        comparableContent({ kind: 'html', html: '<p>same</p>' }, (path) => path, 'refuse', '', '', ['https://two.example']),
      ),
    ).toBe(false)
  })

  test('compares external content by its absolute address', () => {
    const from = (base: string) => (path: string) => new URL(path, base).href
    const relative = { kind: 'url' as const, src: 'slide.html' }
    const comparable = (content: Parameters<typeof comparableContent>[0], base: string) => comparableContent(content, from(base), 'refuse', '', '')
    expect(sameContent(comparable(relative, 'https://one.example/'), comparable(relative, 'https://one.example/'))).toBe(true)
    expect(sameContent(comparable(relative, 'https://one.example/'), comparable(relative, 'https://two.example/'))).toBe(false)
    expect(
      sameContent(
        comparable({ kind: 'image', src: 'slide.png', alt: '' }, 'https://one.example/'),
        comparable({ kind: 'image', src: 'slide.png', alt: '' }, 'https://two.example/'),
      ),
    ).toBe(false)
    expect(
      sameContent(
        comparable({ kind: 'shot', src: 'slide.png', shot }, 'https://one.example/'),
        comparable({ kind: 'shot', src: 'slide.png', shot }, 'https://two.example/'),
      ),
    ).toBe(false)
    expect(
      sameContent(
        comparable({ kind: 'html', html: '<p>same</p>' }, 'https://one.example/'),
        comparable({ kind: 'html', html: '<p>same</p>' }, 'https://two.example/'),
      ),
    ).toBe(true)
  })

  test('uses a shared url reuse key instead of the resolved address', () => {
    const comparable = (src: string, reuseKey?: string) => comparableContent({ kind: 'url', src, reuseKey }, (path) => path, 'refuse', '', '')
    expect(sameContent(comparable('first.html', 'slide-v1'), comparable('second.html', 'slide-v1'))).toBe(true)
    expect(sameContent(comparable('same.html', 'slide-v1'), comparable('same.html', 'slide-v2'))).toBe(false)
    expect(sameContent(comparable('same.html', 'slide-v1'), comparable('same.html'))).toBe(true)
    expect(sameContent(comparable('first.html', 'slide-v1'), comparable('second.html'))).toBe(false)
    expect(sameContent(comparable('same.html', 'slide-v1'), comparable('same.html', 'slide-v1'))).toBe(true)
  })
})
