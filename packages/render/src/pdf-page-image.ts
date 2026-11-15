import { type MediaPage, placedPdfPage, resolveLimits } from '@segnavia/format'
import type { TabRunner } from './browser-tab.ts'
import { RenderRefusedError } from './errors.ts'
import { enforceImageBytes } from './image-bytes.ts'
import { loadPdf } from './pdf-load.ts'
import { type ParsedPdfPageImageOptions, parsePdfPageImageOptions } from './pdf-page-image-options.ts'
import { rasterPdfPageInBrowser } from './pdfjs-browser.ts'
import { sourcePdfMediaPage } from './placed-pdf-source.ts'
import { MAX_PROOF_IMAGE_PIXELS } from './proof-image.ts'
import { type RenderDeadline, withinRenderPermit } from './render-deadline.ts'
import { RENDER_BOUND_MS, type Renderer } from './renderer.ts'

export interface PdfPageImagePlan {
  page: number
  box: { x: number; y: number; width: number; height: number }
  width: number
  height: number
}

/** Selects the page and box as placed media does, and sizes the image to the displayed page at the requested width. */
export function pdfPageImagePlan(pages: MediaPage[], options: Pick<ParsedPdfPageImageOptions, 'page' | 'box' | 'width'>): PdfPageImagePlan {
  const selected = placedPdfPage({ format: 'pdf', pages }, options.page, options.box)
  if (selected === 'no-page') {
    throw new RenderRefusedError(
      `pdfPageImage page ${options.page} is beyond the received PDF's ${pages.length} pages; pass a page from 1 through ${pages.length} to clear this refusal.`,
    )
  }
  const { width } = options
  const height = Math.max(1, Math.round((width * selected.bounds.height) / selected.bounds.width))
  const pixels = width * height
  if (!Number.isSafeInteger(pixels) || pixels > MAX_PROOF_IMAGE_PIXELS) {
    throw new RenderRefusedError(
      `pdfPageImage would make ${pixels} pixels; the ceiling is ${MAX_PROOF_IMAGE_PIXELS} pixels. Reduce width to clear this refusal.`,
    )
  }
  return { page: selected.page, box: selected.sourceBounds, width, height }
}

export async function renderPdfPageImage(
  bytes: Uint8Array,
  options: ParsedPdfPageImageOptions,
  deadline: RenderDeadline,
  withTab: TabRunner,
): Promise<Uint8Array> {
  const limits = resolveLimits(undefined, options.limits)
  const document = await loadPdf(bytes, { source: 'received', operation: 'pdfPageImage', limits })
  const plan = pdfPageImagePlan(
    document.getPages().map((page, index) => sourcePdfMediaPage(page, index + 1)),
    options,
  )
  const png = await withTab(
    {
      viewport: { width: 1, height: 1 },
      scripts: true,
      html: '<!doctype html>',
      readiness: { author: false },
      deadline,
    },
    (tab) => rasterPdfPageInBrowser(tab, bytes, plan),
  )
  return enforceImageBytes(png, options.limits?.bytes)
}

export function createPdfPageImageOperation(acquire: () => Promise<void>, release: () => void, withTab: TabRunner): Renderer['pdfPageImage'] {
  return async (input, opts) => {
    const options = parsePdfPageImageOptions(opts)
    return withinRenderPermit(RENDER_BOUND_MS, acquire, release, (deadline) => renderPdfPageImage(input, options, deadline, withTab))
  }
}
