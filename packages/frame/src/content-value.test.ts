import { describe, expect, test } from 'bun:test'
import { comparableContent, sameContent } from './content-value.ts'

describe('resolved content values', () => {
  test('matches equal values rather than object identity', () => {
    expect(sameContent({ kind: 'html', html: '<p>same</p>' }, { html: '<p>same</p>', kind: 'html' })).toBe(true)
    expect(sameContent({ kind: 'html', html: '<p>before</p>' }, { kind: 'html', html: '<p>after</p>' })).toBe(false)
  })

  test('compares external content by its absolute address', () => {
    const from = (base: string) => (path: string) => new URL(path, base).href
    const relative = { kind: 'url' as const, src: 'slide.html' }
    expect(sameContent(comparableContent(relative, from('https://one.example/')), comparableContent(relative, from('https://one.example/')))).toBe(true)
    expect(sameContent(comparableContent(relative, from('https://one.example/')), comparableContent(relative, from('https://two.example/')))).toBe(false)
    expect(
      sameContent(
        comparableContent({ kind: 'image', src: 'slide.png', alt: '' }, from('https://one.example/')),
        comparableContent({ kind: 'image', src: 'slide.png', alt: '' }, from('https://two.example/')),
      ),
    ).toBe(false)
    expect(
      sameContent(
        comparableContent({ kind: 'html', html: '<p>same</p>' }, from('https://one.example/')),
        comparableContent({ kind: 'html', html: '<p>same</p>' }, from('https://two.example/')),
      ),
    ).toBe(true)
  })
})
