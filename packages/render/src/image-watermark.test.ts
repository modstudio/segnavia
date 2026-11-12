import { expect, test } from 'bun:test'
import { RenderRefusedError } from './errors.ts'
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

test('an unapproved watermark image refuses before overlay injection', async () => {
  const markup = selectedImageWatermarkMarkup({ image: 'https://outside.example/watermark.png' }, 1, page)
  expect(markup).toBeDefined()
  const tab = { evaluateHandle: () => Promise.reject(new Error('overlay injection should not run')) }
  await expect(injectImageWatermark(tab as never, markup ?? '', { scripts: true })).rejects.toEqual(
    new RenderRefusedError(
      'https://outside.example/watermark.png at origin https://outside.example is not approved for image; add { origin: "https://outside.example", kinds: ["image"] } to origins to clear this refusal',
    ),
  )
})

test('an image that fails to decode refuses the overlay', async () => {
  const root = {
    evaluate: async (callback: unknown) => (String(callback).includes('Promise.allSettled') ? ['https://assets.example/watermark.png'] : undefined),
    dispose: async () => {},
  }
  const tab = {
    evaluateHandle: async () => root,
    evaluate: async () => {},
  }

  await expect(
    injectImageWatermark(tab as never, '<img src="https://assets.example/watermark.png">', {
      scripts: true,
      origins: [{ origin: 'https://assets.example', kinds: ['image'] }],
    }),
  ).rejects.toEqual(
    new RenderRefusedError(
      'The image watermark could not decode https://assets.example/watermark.png; supply a decodable image from an approved origin or omit the image to clear this refusal.',
    ),
  )
})

test('the overlay enters the browser top layer after it is appended', async () => {
  const calls: string[] = []
  let overlayCss = ''
  const shadow = {
    append: () => {},
    evaluate: async (callback: unknown) => (String(callback).includes('Promise.allSettled') ? [] : undefined),
    dispose: async () => {},
  }
  const host = {
    setAttribute: (name: string, value: string) => calls.push(`attribute:${name}:${value}`),
    attachShadow: () => shadow,
    showPopover: () => calls.push('show'),
  }
  const documentBefore = globalThis.document
  Object.assign(globalThis, {
    document: {
      createElement: (name: string) =>
        name === 'div'
          ? host
          : {
              textContent: '',
            },
      documentElement: { append: () => calls.push('append') },
      head: { append: () => {} },
      fonts: { ready: Promise.resolve() },
    },
  })
  const tab = {
    evaluateHandle: async (callback: (input: { html: string; css: string; faces: string }) => unknown, input: { html: string; css: string; faces: string }) => {
      overlayCss = input.css
      return callback(input)
    },
    evaluate: async () => {},
  }

  try {
    await injectImageWatermark(tab as never, '<div>Draft</div>', { scripts: true })
  } finally {
    Object.assign(globalThis, { document: documentBefore })
  }

  expect(calls).toEqual(['attribute:popover:manual', 'append', 'show'])
  for (const reset of ['inset:0', 'width:auto', 'height:auto', 'margin:0', 'padding:0', 'border:0', 'background:transparent', 'overflow:hidden']) {
    expect(overlayCss).toContain(reset)
  }
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

  await injectImageWatermark(tab as never, '<div>Draft</div>', { scripts: true }, '@font-face{font-family:SlideFace;src:url(face.woff2)}')

  expect(calls).toEqual(['insert:@font-face{font-family:SlideFace;src:url(face.woff2)}', 'fonts-ready', 'fit', 'images', 'dispose'])
})
