import { describe, expect, test } from 'bun:test'
import { jsonSchemas } from './index.ts'
import { Media } from './media.ts'
import { Placement } from './placement.ts'
import { PlacementRefusedError } from './placement-refusal.ts'

describe('Placement', () => {
  test.each([
    ['board', 'deck'],
    ['board', 'page'],
    ['board', 'paper'],
    ['board', 'book'],
    ['board', 'media'],
    ['board', 'shot'],
    ['book', 'media'],
    ['book', 'page'],
    ['page', 'media'],
    ['deck', 'media'],
    ['paper', 'media'],
  ] as const)('%s accepts %s through the acceptance table', (container, kind) => {
    expect(Placement.parse({ kind, address: 'asset' }, container)).toEqual({ kind, address: 'asset' })
  })

  test('refuses a deck placed in a book and names both kinds', () => {
    expect(() => Placement.parse({ kind: 'deck', address: 'slides' }, 'book')).toThrow(PlacementRefusedError)
    expect(() => Placement.parse({ kind: 'deck', address: 'slides' }, 'book')).toThrow(/book does not accept deck.*clear this refusal/)
  })

  test('refuses a container absent from the acceptance table', () => {
    expect(() => Placement.parse({ kind: 'media', address: 'image' }, 'canvas' as 'page')).toThrow(PlacementRefusedError)
    expect(() => Placement.parse({ kind: 'media', address: 'image' }, 'canvas' as 'page')).toThrow(
      /container could not be accepted: canvas.*board, book, page, deck, paper.*clear this refusal/,
    )
  })

  test.each(['page', 'box', 'crop'] as const)('refuses %s on an asset kind other than media', (field) => {
    const value = field === 'page' ? 1 : field === 'box' ? 'trim' : { top: '2mm' }
    expect(() => Placement.parse({ kind: 'page', address: 'page', [field]: value }, 'board')).toThrow(
      new RegExp(`${field} could not be accepted on page.*clear this refusal`),
    )
  })

  test.each(['page', 'box'] as const)('refuses %s on media without pages', (field) => {
    const media = Media.parse({ format: 'png', size: { width: 20, height: 10 } })
    const value = field === 'page' ? 'Cover' : 'art'
    expect(() => Placement.parse({ kind: 'media', address: 'image', [field]: value }, 'page', media)).toThrow(
      new RegExp(`${field} could not be accepted for png media.*clear this refusal`),
    )
  })

  test('accepts page names, page numbers and boxes for media with pages', () => {
    const media = Media.parse({ format: 'ai', size: { width: 20, height: 10 } })
    expect(Placement.parse({ kind: 'media', address: 'art', page: 'Cover', box: 'art' }, 'deck', media)).toMatchObject({ page: 'Cover', box: 'art' })
    expect(Placement.parse({ kind: 'media', address: 'art', page: 1 }, 'deck', media).page).toBe(1)
    expect(() => Placement.parse({ kind: 'media', address: 'art', page: '   ' }, 'deck', media)).toThrow(/page could not be accepted.*clear this refusal/)
  })

  test.each(['0', '1px', '2.5pt', '.5mm', '3cm', '1in', '25%'])('accepts crop edge %s', (top) => {
    expect(Placement.parse({ kind: 'media', address: 'image', crop: { top } }, 'page').crop?.top).toBe(top)
  })

  test('refuses invalid and empty percentage crops by their fields and remedy', () => {
    expect(() => Placement.parse({ kind: 'media', address: 'image', crop: { left: '-1px' } }, 'page')).toThrow(/crop could not be accepted.*clear this refusal/)
    expect(() => Placement.parse({ kind: 'media', address: 'image', crop: { top: '40%', bottom: '60%' } }, 'page')).toThrow(
      /top and bottom crop percentages leave no area.*clear this refusal/,
    )
    expect(() => Placement.parse({ kind: 'media', address: 'image', crop: { right: '101%' } }, 'page')).toThrow(/right crop percentage.*clear this refusal/)
  })

  test('treats missing and length crop edges as zero percent when checking remaining area', () => {
    expect(() => Placement.parse({ kind: 'media', address: 'image', crop: { top: '100%' } }, 'page')).toThrow(/top crop percentage leaves no area/)
    expect(() => Placement.parse({ kind: 'media', address: 'image', crop: { left: '100%', right: '0mm' } }, 'page')).toThrow(
      /left crop percentage leaves no area/,
    )
    expect(Placement.parse({ kind: 'media', address: 'image', crop: { top: '40%' } }, 'page').crop?.top).toBe('40%')
  })

  test('reports a refined crop refusal with exactly one remedy', () => {
    try {
      Placement.parse({ kind: 'media', address: 'image', crop: { top: '40%', bottom: '60%' } }, 'page')
      throw new Error('expected placement to be refused')
    } catch (error) {
      expect(error).toBeInstanceOf(PlacementRefusedError)
      expect(String(error).match(/to clear this refusal/g)).toHaveLength(1)
    }
  })

  test('publishes media and placement input schemas with their required fields', () => {
    expect(jsonSchemas().media).toMatchObject({ type: 'object', required: ['format', 'size'] })
    expect(jsonSchemas().placement).toMatchObject({ type: 'object', required: ['kind', 'address'] })
  })

  test('accepts fit and direction-bearing alternate text', () => {
    expect(Placement.parse({ kind: 'media', address: 'image', fit: 'cover', alt: { text: 'שלום', lang: 'he' } }, 'page')).toMatchObject({
      fit: 'cover',
      alt: { text: 'שלום', lang: 'he' },
    })
  })
})
