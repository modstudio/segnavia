import { expect, test } from 'bun:test'
import { Deck, limitRefusal } from '@segnavia/format'
import { RenderLimitError, RenderRefusedError } from './errors.ts'
import {
  copyLimits,
  enforceDeckLimits,
  innerLimits,
  parseComposedRenderOptions,
  parseRenderOptions,
  type RenderOptions,
  refuseMultiCompositionProgress,
} from './options.ts'

test('inner renders keep page, local-font and asset limits', () => {
  expect(
    innerLimits({
      pages: 2,
      sheets: 3,
      bytes: 4,
      slides: 5,
      slideBytes: 6,
      notesBytes: 7,
      localFonts: { count: 8, bytes: 9 },
      assets: { each: 10, bytes: 11 },
    }),
  ).toEqual({
    pages: 2,
    localFonts: { count: 8, bytes: 9 },
    assets: { each: 10, bytes: 11 },
  })
})

test('a lone slot copy keeps every limit, and joined copies keep only the inner ones', () => {
  const limits = { pages: 2, sheets: 3, bytes: 4, assets: { each: 5 } }
  expect(copyLimits(limits, undefined)).toEqual(limits)
  expect(copyLimits(limits, { fills: [{}] })).toEqual(limits)
  expect(copyLimits(limits, { fills: [{}, {}] })).toEqual({ pages: 2, assets: { each: 5 } })
})

test('render deck limits refuse before rendering with every exceeded measure', () => {
  const deck = Deck.parse({
    title: 'Deck',
    size: { width: 400, height: 300 },
    slides: [
      { id: 'one', content: { kind: 'html', html: '<p>One</p>' } },
      { id: 'two', content: { kind: 'html', html: '<p>Two</p>' } },
    ],
  })
  const work = () => enforceDeckLimits(deck, { slides: 1, slideBytes: 5 })
  expect(work).toThrow(RenderRefusedError)
  expect(work).toThrow(
    `${limitRefusal('slides', 2, 1)}; ${limitRefusal('slideBytes', 10, 5, { where: 'slide 1' })}; ${limitRefusal('slideBytes', 10, 5, {
      where: 'slide 2',
    })}`,
  )
  try {
    work()
  } catch (error) {
    expect(error).toBeInstanceOf(RenderLimitError)
    expect((error as RenderLimitError).exceeded).toMatchObject([
      { measure: 'slides', limit: 1, actual: 2 },
      { measure: 'slideBytes', limit: 5, actual: 10, where: 'slide 1' },
      { measure: 'slideBytes', limit: 5, actual: 10, where: 'slide 2' },
    ])
  }
})

test('removed render local-font limits name its replacement', () => {
  expect(() => parseRenderOptions({ localFonts: { limits: { count: 1 } } } as never)).toThrow('limits.localFonts')
})

test('parsed options own one asset budget that copies preserve', () => {
  const options = parseRenderOptions({} as RenderOptions)
  expect(options.assetBudget).toEqual({ bytes: 0 })
})

test('parsed options materialize one-shot origin approvals', () => {
  function* origins() {
    yield { origin: 'https://images.example', kinds: ['image'] as const }
  }
  const parsed = parseRenderOptions({ origins: origins() } as RenderOptions)
  expect([...(parsed.origins ?? [])]).toEqual([{ origin: 'https://images.example', kinds: ['image'] }])
  expect([...(parsed.origins ?? [])]).toEqual([{ origin: 'https://images.example', kinds: ['image'] }])
})

test('progress is normalized to one report function at the option edge', () => {
  const report = () => {}
  expect(parseRenderOptions({ progress: { report } }).progress).toEqual({ report })
  expect(parseRenderOptions({}).progress).toBeUndefined()
  expect(() => parseRenderOptions({ progress: {} } as never)).toThrow('The progress option needs a report function')
})

test('progress refuses render calls that would compose more than one document', () => {
  const progress = { report: () => {} }
  expect(() => refuseMultiCompositionProgress({ progress }, 'pagePdf', false)).not.toThrow()
  expect(() => refuseMultiCompositionProgress({ progress }, 'pagePdf', true)).toThrow(
    'The progress option is reported per single composition; pagePdf would compose multiple documents. Remove progress and call pagePdf once per page',
  )
})

test('invalid preflight profiles refuse at the option edge', () => {
  expect(() => parseComposedRenderOptions({ preflight: { profile: 'unknown' as never } })).toThrow(RenderRefusedError)
  expect(() => parseComposedRenderOptions({ preflight: { profile: 'unknown' as never } })).toThrow(
    'Preflight preset "unknown" is unknown; use "default", "strict", or "off" to clear this refusal.',
  )
})
