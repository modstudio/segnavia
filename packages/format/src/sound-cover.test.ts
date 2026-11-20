import { describe, expect, test } from 'bun:test'
import { soundCover } from './sound-cover.ts'

function htmlOf(input: Parameters<typeof soundCover>[0]): string {
  const body = soundCover(input).page.body
  if (!('html' in body)) throw new Error('expected stored HTML')
  return body.html
}

describe('soundCover', () => {
  test.each([
    [{ text: 'Opening music', lang: 'en' }, 'ltr'],
    [{ text: 'מוזיקת פתיחה', lang: 'he' }, 'rtl'],
  ] as const)('isolates the title $0.text in its resolved direction', (title, direction) => {
    expect(htmlOf({ format: 'mp3', durationMs: 42_000, title })).toContain(`<bdi dir="${direction}" lang="${title.lang}">${title.text}</bdi>`)
  })

  test('omits absent optional text', () => {
    const html = htmlOf({ format: 'ogg', durationMs: 1_000 })
    expect(html).not.toContain('class="title"')
    expect(html).not.toContain('class="credit"')
  })

  test.each([
    [42_000, '0:42'],
    [3_723_000, '1:02:03'],
  ])('formats duration %d as %s', (durationMs, expected) => {
    expect(htmlOf({ format: 'wav', durationMs })).toContain(`>${expected}</bdi>`)
  })

  test('uses an image placement when given and the sound glyph otherwise', () => {
    expect(htmlOf({ format: 'm4a', durationMs: 1_000, image: 'art/cover' })).toContain('data-segnavia-media="art/cover"')
    expect(htmlOf({ format: 'm4a', durationMs: 1_000 })).toContain('class="glyph"')
  })

  test('returns the standard cover sheet with scripts refused', () => {
    const cover = soundCover({ format: 'mp3', durationMs: 1_000 })
    expect(cover.page.scripts).toBe('refuse')
    expect(cover.page.print.paper).toEqual({ width: 160, height: 100, unit: 'mm' })
  })
})
