import { type Renderer, RenderRefusedError } from '@segnavia/render'
import { degrees, PDFDocument, PDFName, PDFNumber, rgb } from 'pdf-lib'
import { type BrowserContext, chromium } from 'playwright-core'
import { renderInBrowserTab } from '../../packages/render/src/browser-tab.ts'
import { rasterPdfPageInBrowser } from '../../packages/render/src/pdfjs-browser.ts'
import { imageSize } from './image-size.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

async function fixture(turned = false): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const page = document.addPage([100, 50])
  page.drawRectangle({ x: 20, y: 10, width: 40, height: 25, color: rgb(0, 0.5, 0) })
  if (turned) {
    page.setRotation(degrees(90))
    page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2))
  }
  return document.save()
}

const green = (pixel: number[]) => pixel[0] === 0 && (pixel[1] ?? 0) > 100 && pixel[2] === 0

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
      async (tab) => {
        const png = await rasterPdfPageInBrowser(tab, pdf, { page: 1, box: { x: 0, y: 0, width: 100, height: 50 }, width: 200, height: 100 })
        return { png, pixel: await decodedPixel(tab, png, 60, 50) }
      },
    )
    check(
      'pdf.js renders a PDF fixture from injected build and worker content in an offline tab',
      raster.png[0] === 0x89 && raster.png[1] === 0x50 && green(raster.pixel),
      `pixel=${raster.pixel.join(',')}`,
    )
    const output = await renderer.pdfPageImage(pdf, { width: 200 })
    const size = imageSize(output)
    const page = await context?.newPage()
    const pixel = page ? await decodedPixel(page, output, 60, 50) : []
    check(
      'pdfPageImage returns the requested PNG size with the fixture color',
      size?.width === 200 && size.height === 100 && output[0] === 0x89 && output[1] === 0x50 && green(pixel),
      `size=${size?.width}x${size?.height}; pixel=${pixel.join(',')}`,
    )
    const ground = page ? await decodedPixel(page, output, 5, 5) : []
    check('pdfPageImage paints an opaque white ground outside the page content', ground.join(',') === '255,255,255,255', `pixel=${ground.join(',')}`)
    const turned = await renderer.pdfPageImage(await fixture(true), { width: 100 })
    const turnedSize = imageSize(turned)
    const inside = page ? await decodedPixel(page, turned, 45, 80) : []
    const outside = page ? await decodedPixel(page, turned, 45, 20) : []
    check(
      'pdfPageImage sizes and draws a page turned by /Rotate and scaled by /UserUnit as displayed',
      turnedSize?.width === 100 && turnedSize.height === 200 && green(inside) && outside.join(',') === '255,255,255,255',
      `size=${turnedSize?.width}x${turnedSize?.height}; inside=${inside.join(',')}; outside=${outside.join(',')}`,
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
