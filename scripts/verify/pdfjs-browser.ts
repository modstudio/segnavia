import { PDFDocument, rgb } from 'pdf-lib'
import { type BrowserContext, chromium } from 'playwright-core'
import { renderInBrowserTab } from '../../packages/render/src/browser-tab.ts'
import { rasterPdfPageInBrowser } from '../../packages/render/src/pdfjs-browser.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

async function fixture(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const page = document.addPage([100, 50])
  page.drawRectangle({ x: 20, y: 10, width: 40, height: 25, color: rgb(0, 0.5, 0) })
  return document.save()
}

export async function verifyPdfjsBrowser(executablePath: string, check: Check): Promise<void> {
  const browser = await chromium.launch({ executablePath })
  let context: BrowserContext | undefined
  try {
    const pdf = await fixture()
    const raster = await renderInBrowserTab(
      browser,
      { viewport: { width: 1, height: 1 }, scripts: true, html: '<!doctype html>', readiness: {}, boundMs: 60_000 },
      undefined,
      { settled: () => false, opened: (opened) => (context = opened), crashed: () => {} },
      (tab) => rasterPdfPageInBrowser(tab, pdf, { page: 1, width: 200, height: 100 }),
    )
    const offset = (50 * 200 + 60) * 4
    check(
      'pdf.js renders a PDF fixture from injected build and worker content in an offline tab',
      raster.png[0] === 0x89 && raster.png[1] === 0x50 && raster.rgba[offset] === 0 && (raster.rgba[offset + 1] ?? 0) > 100,
    )
  } finally {
    await context?.close().catch(() => {})
    await browser.close()
  }
}
