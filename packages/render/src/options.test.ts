import { expect, test } from 'bun:test'
import { Deck, limitRefusal } from '@segnavia/format'
import { PLACED_PDF_SOURCES } from '@segnavia/html'
import { degrees, PDFDocument, PDFName, PDFNumber } from 'pdf-lib'
import { parseBookPdfOptions } from './book-options.ts'
import { RenderLimitError, RenderRefusedError } from './errors.ts'
import {
  copyLimits,
  enforceDeckLimits,
  innerLimits,
  pageCompositionCount,
  parseComposedRenderOptions,
  parseRenderOptions,
  type RenderOptions,
  refuseProgressUnlessOneComposition,
} from './options.ts'
import { parsePagePdfOptions } from './page-render-options.ts'

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

test('placed PDF bytes are validated through received input limits before vector composition', async () => {
  const parsed = parsePagePdfOptions(
    {
      limits: { input: { bytes: 2 } },
      placements: {
        resolve: async () => ({
          kind: 'media' as const,
          media: { format: 'pdf' as const, size: { width: 10, height: 10 }, pages: [{ boxes: { media: { x: 0, y: 0, width: 10, height: 10 } } }] },
          src: 'data:image/png;base64,AA==',
          bytes: new Uint8Array([1, 2, 3]),
        }),
      },
    },
    'pagePdf',
  )
  const work = parsed.placements?.resolve({ kind: 'media', address: 'document' }, { purpose: 'print', signal: new AbortController().signal })
  await expect(work).rejects.toEqual(expect.objectContaining({ reason: 'too-large' }))
})

test('non-draw operations pass placed PDF answers through without loading their bytes', async () => {
  const answer = {
    kind: 'media' as const,
    media: { format: 'pdf' as const, size: { width: 10, height: 10 }, pages: [{ boxes: { media: { x: 0, y: 0, width: 10, height: 10 } } }] },
    src: 'data:image/png;base64,AA==',
    bytes: new TextEncoder().encode('%PDF-1.7\nnot a document\n%%EOF'),
  }
  const resolve = async () => answer
  const parsed = parseRenderOptions({ placements: { resolve } })
  expect(parsed.placements?.resolve).toBe(resolve)
  expect(await parsed.placements?.resolve({ kind: 'media', address: 'document' }, { purpose: 'print', signal: new AbortController().signal })).toBe(answer)
})

test('only vector-composing PDF operations create a placed PDF registry', () => {
  const placements = { resolve: async () => undefined }
  expect(parseRenderOptions({ placements }).placements?.[PLACED_PDF_SOURCES]).toBeUndefined()
  expect(parsePagePdfOptions({ placements }, 'pagePdf').placements?.[PLACED_PDF_SOURCES]).toBeInstanceOf(Map)
  expect(parsePagePdfOptions({ placements }, 'pagesPdf').placements?.[PLACED_PDF_SOURCES]).toBeInstanceOf(Map)
  expect(parseBookPdfOptions({ placements }).placements?.[PLACED_PDF_SOURCES]).toBeInstanceOf(Map)
})

test('placed PDF validation replaces host rotation and UserUnit with source facts', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([200, 100])
  page.setRotation(degrees(90))
  page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2))
  const placements = parsePagePdfOptions(
    {
      placements: {
        resolve: async () => ({
          kind: 'media' as const,
          media: {
            format: 'pdf' as const,
            size: { width: 200, height: 100 },
            pages: [{ rotate: 0 as const, userUnit: 1, boxes: { media: { x: 0, y: 0, width: 200, height: 100 } } }],
          },
          src: 'data:image/png;base64,AA==',
          bytes: await document.save(),
        }),
      },
    },
    'pagePdf',
  ).placements
  const answer = await placements?.resolve({ kind: 'media', address: 'document' }, { purpose: 'print', signal: new AbortController().signal })
  expect(answer).toMatchObject({ media: { pages: [{ rotate: 90, userUnit: 2 }] } })
})

test.each([
  ['encrypted', new TextEncoder().encode('%PDF-1.7\n/Encrypt 1 0 R\n%%EOF')],
  ['unreadable', new TextEncoder().encode('%PDF-1.7\nnot a document\n%%EOF')],
] as const)('placed PDF validation carries the %s failure reason as data', async (reason, bytes) => {
  const parsed = parseRenderOptions(
    {
      placements: {
        resolve: async () => ({
          kind: 'media' as const,
          media: { format: 'pdf' as const, size: { width: 10, height: 10 }, pages: [{ boxes: { media: { x: 0, y: 0, width: 10, height: 10 } } }] },
          src: 'data:image/png;base64,AA==',
          bytes,
        }),
      },
    },
    true,
  )
  const work = parsed.placements?.resolve({ kind: 'media', address: 'document' }, { purpose: 'print', signal: new AbortController().signal })
  await expect(work).rejects.toEqual(expect.objectContaining({ reason }))
})

test('placed PDF validation refuses a selected page beyond the received source page range', async () => {
  const document = await PDFDocument.create()
  document.addPage([10, 10]).drawText('one')
  const parsed = parsePagePdfOptions(
    {
      placements: {
        resolve: async () => ({
          kind: 'media' as const,
          media: {
            format: 'pdf' as const,
            size: { width: 10, height: 10 },
            pages: [{ boxes: { media: { x: 0, y: 0, width: 10, height: 10 } } }, { boxes: { media: { x: 0, y: 0, width: 10, height: 10 } } }],
          },
          src: 'data:image/png;base64,AA==',
          bytes: await document.save(),
        }),
      },
    },
    'pagePdf',
  )
  const work = parsed.placements?.resolve({ kind: 'media', address: 'document', page: 2 }, { purpose: 'print', signal: new AbortController().signal })
  await expect(work).rejects.toEqual(expect.objectContaining({ reason: 'unreadable' }))
})

test('progress is normalized to one report function at the option edge', () => {
  const report = () => {}
  expect(parseRenderOptions({ progress: { report } }).progress).toEqual({ report })
  expect(parseRenderOptions({}).progress).toBeUndefined()
  expect(() => parseRenderOptions({ progress: {} } as never)).toThrow('The progress option needs a report function')
})

test('progress is accepted only when a render runs one composition', () => {
  const progress = { report: () => {} }
  expect(() => refuseProgressUnlessOneComposition({ progress }, 1)).not.toThrow()
  expect(() => refuseProgressUnlessOneComposition({ progress }, 2)).toThrow(
    'The progress option is reported per single composition; this render runs 2 compositions. Omit progress and render one paginated book or printed page at a time',
  )
  expect(() => refuseProgressUnlessOneComposition({ progress }, 0)).toThrow(
    'The progress option is reported by a paginated book or a printed page; this render runs no composer. Omit progress to clear this refusal.',
  )
})

test('page composition count includes only printed pages and their output copies', () => {
  const plain = { html: '', size: { width: 100, height: 100 } }
  const printed = { ...plain, printedPages: { parents: [], parentRules: [] } }
  expect(pageCompositionCount([plain, printed] as never)).toBe(1)
  expect(pageCompositionCount([printed] as never, { fills: [{}, {}] })).toBe(2)
})

test('invalid preflight profiles refuse at the option edge', () => {
  expect(() => parseComposedRenderOptions({ preflight: { profile: 'unknown' as never } })).toThrow(RenderRefusedError)
  expect(() => parseComposedRenderOptions({ preflight: { profile: 'unknown' as never } })).toThrow(
    'Preflight preset "unknown" is unknown; use "default", "strict", or "off" to clear this refusal.',
  )
})
