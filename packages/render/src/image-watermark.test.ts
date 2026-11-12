import { expect, test } from 'bun:test'
import { markupAssetRefusal } from './browser-tab.ts'
import { imageWatermarkPage, injectImageWatermark, nestedFrameFontFacts, selectedImageWatermarkMarkup } from './image-watermark.ts'

const page = imageWatermarkPage({
  viewport: { width: 800, height: 600 },
  trim: { width: 720, height: 520 },
  direction: 'rtl',
  lang: 'he',
  fontFamily: 'Page Serif',
})

test('selected image pages receive the shared watermark markup and unselected pages do not', () => {
  const watermark = { text: 'טיוטה', pages: [3] }
  const selected = selectedImageWatermarkMarkup(watermark, 3, page)

  expect(selected).toContain('class="segnavia-watermark-page"')
  expect(selected).toContain('font-family:Page Serif')
  expect(selected).toContain('<bdi dir="rtl" lang="he">טיוטה</bdi>')
  expect(selectedImageWatermarkMarkup(watermark, 2, page)).toBeUndefined()
})

test('page and trim pixels are expressed as equivalent CSS points', () => {
  expect(page).toMatchObject({
    media: { width: 600, height: 450 },
    trim: { x: 30, y: 30, width: 540, height: 390 },
  })
})

test('an unapproved watermark image produces the ordinary asset refusal', () => {
  const markup = selectedImageWatermarkMarkup({ image: 'https://outside.example/watermark.png' }, 1, page)
  expect(markup).toBeDefined()
  expect(markupAssetRefusal(markup ?? '', { scripts: true })).toBe(
    'https://outside.example/watermark.png at origin https://outside.example is not approved for image; add { origin: "https://outside.example", kinds: ["image"] } to origins to clear this refusal',
  )
})

test("a slide's family and face rules are collected from its frame", async () => {
  const facts = { fontFamily: 'Slide Face, serif', fontFaceCss: '@font-face{font-family:"Slide Face";src:url(face.woff2)}' }
  const main = {}
  const slide = { evaluate: async () => facts }
  const tab = {
    mainFrame: () => main,
    frames: () => [main, slide],
  }

  expect(await nestedFrameFontFacts(tab as never)).toEqual(facts)
})

test('the outer document loads slide faces before watermark text is fitted', async () => {
  const calls: string[] = []
  const root = {
    evaluate: async (callback: unknown) => calls.push(String(callback).includes('fitWatermarkText') ? 'fit' : 'images'),
    dispose: async () => calls.push('dispose'),
  }
  const tab = {
    evaluateHandle: async (_callback: unknown, input: { faces: string }) => {
      calls.push(`insert:${input.faces}`)
      return root
    },
    evaluate: async () => calls.push('fonts-ready'),
  }

  await injectImageWatermark(tab as never, '<div>Draft</div>', '@font-face{font-family:SlideFace;src:url(face.woff2)}')

  expect(calls).toEqual(['insert:@font-face{font-family:SlideFace;src:url(face.woff2)}', 'fonts-ready', 'fit', 'images', 'dispose'])
})
