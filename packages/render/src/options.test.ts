import { expect, test } from 'bun:test'
import { Deck, limitRefusal } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import { copyLimits, enforceDeckLimits, innerLimits, parseRenderOptions } from './options.ts'

test('inner renders keep only page and local-font limits', () => {
  expect(innerLimits({ pages: 2, sheets: 3, bytes: 4, slides: 5, slideBytes: 6, notesBytes: 7, localFonts: { count: 8, bytes: 9 } })).toEqual({
    pages: 2,
    localFonts: { count: 8, bytes: 9 },
  })
})

test('a lone slot copy keeps every limit, and joined copies keep only the inner ones', () => {
  const limits = { pages: 2, sheets: 3, bytes: 4 }
  expect(copyLimits(limits, undefined)).toEqual(limits)
  expect(copyLimits(limits, { fills: [{}] })).toEqual(limits)
  expect(copyLimits(limits, { fills: [{}, {}] })).toEqual({ pages: 2 })
})

test('render deck limits refuse before rendering', () => {
  const deck = Deck.parse({
    title: 'Deck',
    size: { width: 400, height: 300 },
    slides: [
      { id: 'one', content: { kind: 'html', html: '<p>One</p>' } },
      { id: 'two', content: { kind: 'html', html: '<p>Two</p>' } },
    ],
  })
  expect(() => enforceDeckLimits(deck, { slides: 1 })).toThrow(new RenderRefusedError(limitRefusal('slides', 2, 1)))
})

test('removed render local-font limits name its replacement', () => {
  expect(() => parseRenderOptions({ localFonts: { limits: { count: 1 } } } as never)).toThrow('limits.localFonts')
})
