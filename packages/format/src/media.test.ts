import { describe, expect, test } from 'bun:test'
import { Media, mediaTextDirection } from './media.ts'

const input = (format: string) => ({ format, size: { width: 640, height: 480 } })

describe('Media', () => {
  test.each(['png', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'ai'])('accepts the %s source format', (format) => {
    expect(Media.parse(input(format)).format).toBe(format)
  })

  test('accepts page boxes on PDF and Illustrator media', () => {
    const pages = [
      {
        name: 'Cover',
        boxes: {
          media: { x: 0, y: 0, width: 612, height: 792 },
          crop: { x: 18, y: 18, width: 576, height: 756 },
          trim: { x: 24, y: 24, width: 564, height: 744 },
          bleed: { x: 15, y: 15, width: 582, height: 762 },
          art: { x: 30, y: 30, width: 552, height: 732 },
        },
      },
    ]
    expect(Media.parse({ ...input('pdf'), pages }).pages).toEqual(pages)
    expect(Media.parse({ ...input('ai'), pages }).pages).toEqual(pages)
  })

  test('refuses pages on a format without pages and names the remedy', () => {
    expect(() => Media.parse({ ...input('png'), pages: [] })).toThrow(/pages could not be accepted.*clear this refusal/)
  })

  test.each([
    [{ width: 0, height: 1 }, 'size.width'],
    [{ width: 1, height: -1 }, 'size.height'],
  ])('refuses a non-positive intrinsic size', (size, field) => {
    expect(() => Media.parse({ ...input('svg'), size })).toThrow(new RegExp(`${field} could not be accepted.*clear this refusal`))
  })

  test('accepts resolution only for raster media', () => {
    expect(Media.parse({ ...input('webp'), resolution: 300 }).resolution).toBe(300)
    expect(() => Media.parse({ ...input('svg'), resolution: 300 })).toThrow(/resolution could not be accepted.*clear this refusal/)
  })

  test('accepts extraction provenance only for SVG and raster media', () => {
    const derivedFrom = { address: 'source.ai', page: 'Logo', name: 'Logo' }
    expect(Media.parse({ ...input('svg'), derivedFrom }).derivedFrom).toEqual(derivedFrom)
    expect(Media.parse({ ...input('jpeg'), derivedFrom: { address: 'source.pdf', page: 2 } }).derivedFrom?.page).toBe(2)
    expect(() => Media.parse({ ...input('pdf'), derivedFrom })).toThrow(/derivedFrom could not be accepted.*clear this refusal/)
  })

  test('resolves caption direction from declared direction, language, then text', () => {
    const hebrew = Media.parse({ ...input('png'), caption: { text: 'שלום' } })
    expect(hebrew.caption && mediaTextDirection(hebrew.caption)).toBe('rtl')
    expect(mediaTextDirection({ text: 'שלום', dir: 'ltr' })).toBe('ltr')
    expect(mediaTextDirection({ text: 'Hello', lang: 'he' })).toBe('rtl')
  })
})
