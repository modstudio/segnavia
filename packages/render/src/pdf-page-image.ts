import { displayedPdfPage, type MediaPage, type PageBoxName, placedPdfPage, resolveLimits } from '@segnavia/format'
import { PDFArray, PDFName, type PDFPage } from 'pdf-lib'
import type { TabRunner } from './browser-tab.ts'
import { RenderRefusedError } from './errors.ts'
import { enforceImageBytes } from './image-bytes.ts'
import { loadPdf } from './pdf-load.ts'
import type { ParsedPdfPageImageOptions } from './pdf-page-image-options.ts'
import { rasterPdfPageInBrowser } from './pdfjs-browser.ts'
import { sourcePdfPageFacts } from './placed-pdf-source.ts'
import { MAX_PROOF_IMAGE_PIXELS } from './proof-image.ts'
import type { RenderDeadline } from './render-deadline.ts'

const BOX_KEYS: Record<PageBoxName, string> = {
  media: 'MediaBox',
  crop: 'CropBox',
  bleed: 'BleedBox',
  trim: 'TrimBox',
  art: 'ArtBox',
}

function directBox(page: PDFPage, box: PageBoxName): MediaPage['boxes'][PageBoxName] | undefined {
  const object = page.node.get(PDFName.of(BOX_KEYS[box]))
  return page.doc.context.lookupMaybe(object, PDFArray)?.asRectangle()
}

function pageFacts(page: PDFPage): MediaPage {
  const media = directBox(page, 'media') ?? page.getMediaBox()
  const boxes = Object.fromEntries(
    (Object.keys(BOX_KEYS) as PageBoxName[]).flatMap((box) => {
      const bounds = box === 'media' ? media : directBox(page, box)
      return bounds ? [[box, bounds]] : []
    }),
  ) as MediaPage['boxes']
  return { boxes, ...sourcePdfPageFacts(page) }
}

export function pdfPageImageSize(
  bounds: { x: number; y: number; width: number; height: number },
  rotate: number,
  userUnit: number,
  width: number,
): { width: number; height: number } {
  const displayed = displayedPdfPage(bounds, rotate, userUnit)
  const height = Math.max(1, Math.round((width * displayed.height) / displayed.width))
  const pixels = width * height
  if (!Number.isSafeInteger(pixels) || pixels > MAX_PROOF_IMAGE_PIXELS) {
    throw new RenderRefusedError(
      `pdfPageImage would make ${pixels} pixels; the ceiling is ${MAX_PROOF_IMAGE_PIXELS} pixels. Reduce width to clear this refusal.`,
    )
  }
  return { width, height }
}

export async function renderPdfPageImage(
  bytes: Uint8Array,
  options: ParsedPdfPageImageOptions,
  deadline: RenderDeadline,
  withTab: TabRunner,
): Promise<Uint8Array> {
  const limits = resolveLimits(undefined, options.limits)
  const document = await loadPdf(bytes, { source: 'received', operation: 'pdfPageImage', limits })
  const count = document.getPageCount()
  if (options.page > count) {
    throw new RenderRefusedError(
      `pdfPageImage page ${options.page} is beyond the received PDF's ${count} pages; pass a page from 1 through ${count} to clear this refusal.`,
    )
  }
  const pages = document.getPages().map(pageFacts)
  const selected = placedPdfPage({ format: 'pdf', pages }, options.page, options.box)
  if (selected === 'no-page') throw new RenderRefusedError('pdfPageImage could not select the requested PDF page; pass an existing page to clear this refusal.')
  const source = pages[selected.page - 1] as MediaPage
  const size = pdfPageImageSize(selected.sourceBounds, source.rotate ?? 0, source.userUnit ?? 1, options.width)
  const raster = await withTab(
    {
      viewport: { width: 1, height: 1 },
      scripts: true,
      html: '<!doctype html>',
      readiness: { author: false },
      deadline,
    },
    (tab) => rasterPdfPageInBrowser(tab, bytes, { page: selected.page, box: selected.sourceBounds, ...size }),
  )
  return enforceImageBytes(raster.png, options.limits?.bytes)
}
