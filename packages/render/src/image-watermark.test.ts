import { expect, test } from 'bun:test'
import { markupAssetRefusal } from './browser-tab.ts'
import { imageWatermarkPage, selectedImageWatermarkMarkup } from './image-watermark.ts'

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
