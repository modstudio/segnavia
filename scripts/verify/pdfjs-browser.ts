import { type Renderer, RenderRefusedError } from '@segnavia/render'
import { PDFDocument, rgb } from 'pdf-lib'
import { type BrowserContext, chromium } from 'playwright-core'
import { renderInBrowserTab } from '../../packages/render/src/browser-tab.ts'
import { rasterPdfPageInBrowser } from '../../packages/render/src/pdfjs-browser.ts'
import { imageSize } from './image-size.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

async function fixture(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const page = document.addPage([100, 50])
  page.drawRectangle({ x: 20, y: 10, width: 40, height: 25, color: rgb(0, 0.5, 0) })
  return document.save()
}

async function decodedPixel(page: import('playwright-core').Page, png: Uint8Array, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    async ({ encoded, x, y }) => {
      const data = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([data], { type: 'image/png' }))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Chromium could not create a 2D canvas for PNG verification')
      context.drawImage(bitmap, 0, 0)
      bitmap.close()
      return [...context.getImageData(x, y, 1, 1).data]
    },
    { encoded: Buffer.from(png).toString('base64'), x, y },
  )
}

export async function verifyPdfjsBrowser(executablePath: string, renderer: Renderer, check: Check): Promise<void> {
  const browser = await chromium.launch({ executablePath })
  let context: BrowserContext | undefined
  try {
    const pdf = await fixture()
    const raster = await renderInBrowserTab(
      browser,
      { viewport: { width: 1, height: 1 }, scripts: true, html: '<!doctype html>', readiness: { author: false } },
      undefined,
      { settled: () => false, opened: (opened) => (context = opened), crashed: () => {} },
      (tab) =>
        rasterPdfPageInBrowser(tab, pdf, {
          page: 1,
          box: { x: 0, y: 0, width: 100, height: 50 },
          width: 200,
          height: 100,
          inspectPixels: true,
        }),
    )
    const offset = (50 * 200 + 60) * 4
    check(
      'pdf.js renders a PDF fixture from injected build and worker content in an offline tab',
      raster.png[0] === 0x89 && raster.png[1] === 0x50 && raster.rgba?.[offset] === 0 && (raster.rgba?.[offset + 1] ?? 0) > 100,
    )
    const output = await renderer.pdfPageImage(pdf, { width: 200 })
    const size = imageSize(output)
    const page = await context?.newPage()
    const pixel = page ? await decodedPixel(page, output, 60, 50) : []
    check(
      'pdfPageImage returns the requested PNG size with the fixture color',
      size?.width === 200 && size.height === 100 && output[0] === 0x89 && output[1] === 0x50 && pixel[0] === 0 && (pixel[1] ?? 0) > 100 && pixel[2] === 0,
      `size=${size?.width}x${size?.height}; pixel=${pixel.join(',')}`,
    )

    let requestRefusal: unknown
    try {
      await renderInBrowserTab(
        browser,
        { viewport: { width: 1, height: 1 }, scripts: true, html: '<!doctype html>', readiness: { author: false } },
        undefined,
        { settled: () => false, opened: () => {}, crashed: () => {} },
        (tab) => tab.evaluate(() => fetch('https://outside.invalid/pdf-page-image')),
      )
    } catch (error) {
      requestRefusal = error
    }
    check(
      'a request from the PDF rendering tab is refused by the offline interceptor',
      requestRefusal instanceof RenderRefusedError && requestRefusal.message.includes('https://outside.invalid/pdf-page-image'),
      String(requestRefusal),
    )
  } finally {
    await context?.close().catch(() => {})
    await browser.close()
  }
}
