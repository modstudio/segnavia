import { Imposition, type ImpositionInput, impose, Page, type PageInput, PX_PER_MM } from '@segnavia/format'
import { printablePages } from '@segnavia/frame/print-document'
import { PDFDocument } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import type { RenderOptions } from './index.ts'

export type PagesPdfOptions = RenderOptions & { imposition?: ImpositionInput }

interface PagesPdfServices {
  pagePdf(page: Page, options: RenderOptions): Promise<Uint8Array>
  fontFaces(options: RenderOptions): string
  withTab<T>(
    setup: {
      viewport: { width: number; height: number }
      scripts: boolean
      html: string
      waitForReady: boolean
      boundMs?: number
      beforeOutput?: (tab: Tab) => Promise<void>
    },
    body: (tab: Tab) => Promise<T>,
  ): Promise<T>
  enforce(pdf: Uint8Array, limits: RenderOptions['limits']): Promise<Uint8Array>
}

async function joinPdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
  const joined = await PDFDocument.create()
  for (const bytes of pdfs) {
    const source = await PDFDocument.load(bytes)
    const pages = await joined.copyPages(source, source.getPageIndices())
    for (const page of pages) joined.addPage(page)
  }
  return joined.save()
}

export async function renderPagesPdf(inputs: PageInput[], opts: PagesPdfOptions, services: PagesPdfServices): Promise<Uint8Array> {
  if (inputs.length === 0) throw new RenderRefusedError('There is nothing to render.')
  const pages = inputs.map((input) => Page.parse(input))
  if (!opts.imposition) {
    const rendered = await Promise.all(pages.map((page) => services.pagePdf(page, { ...opts, limits: undefined })))
    return services.enforce(await joinPdfs(rendered), opts.limits)
  }
  if (opts.preferCssPageSize) {
    throw new RenderRefusedError(
      'Pages in an imposition take their size from its paper. Remove preferCssPageSize, or remove the imposition, to clear this refusal.',
    )
  }
  const imposition = Imposition.parse(opts.imposition)
  const imposed = impose(imposition, pages.length)
  const css = `${services.fontFaces(opts)}${opts.css ?? ''}`
  const html = printablePages(pages, imposition, { css })
  const pdf = await services.withTab(
    {
      viewport: { width: Math.round(imposed.paper.width * PX_PER_MM), height: Math.round(imposed.paper.height * PX_PER_MM) },
      scripts: pages.some((page) => page.scripts === 'sandboxed'),
      html,
      waitForReady: false,
      boundMs: opts.boundMs,
      beforeOutput: opts.beforeOutput,
    },
    (tab) => tab.pdf({ preferCSSPageSize: true, printBackground: true }),
  )
  return services.enforce(pdf, opts.limits)
}
