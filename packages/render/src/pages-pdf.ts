import { Imposition, type ImpositionInput, impose, MM_PER_PT, Page, type PageInput, printPadding, printProperties } from '@segnavia/format'
import { PDFDocument } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import type { RenderOptions } from './index.ts'
import { groupPieces, type PieceGeometry, pieceGeometry, placementPdfGeometry } from './pages-imposition.ts'
import { drawClippedPage, embedOnePage } from './pdf-compose.ts'

export type PagesPdfOptions = RenderOptions & { imposition?: ImpositionInput }

interface PagesPdfServices {
  pagePdf(page: Page, options: RenderOptions): Promise<Uint8Array>
  piecePdf(page: Page, geometry: PieceGeometry, css: string, options: RenderOptions): Promise<Uint8Array>
  fontFaces(options: RenderOptions): string
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

function namePageError(error: unknown, page: number): never {
  if (error instanceof Error) {
    error.message = `Page at index ${page} could not be rendered: ${error.message}`
    throw error
  }
  throw new Error(`Page at index ${page} could not be rendered: ${String(error)}`)
}

async function composedPdf(pages: Page[], imposition: Imposition, opts: PagesPdfOptions, services: PagesPdfServices): Promise<Uint8Array> {
  const imposed = impose(imposition, pages.length)
  const groups = groupPieces(pages, imposed, imposition.fit)
  const properties = printProperties(imposition, imposition.unit)
  const hostCss = `${services.fontFaces(opts)}${opts.css ?? ''}`
  const rendered = await Promise.all(
    groups.map(async (group) => {
      const page = pages[group.page]
      const first = group.placements[0]
      if (!page || !first) throw new Error(`The piece for page ${group.page} has no placement.`)
      const geometry = pieceGeometry(first)
      const css = `${properties}${geometry.padding ? printPadding(geometry.padding) : ''}${hostCss}`
      try {
        return { group, bytes: await services.piecePdf(page, geometry, css, opts) }
      } catch (error) {
        namePageError(error, group.page)
      }
    }),
  )
  const output = await PDFDocument.create()
  const embedded = new Map<string, Awaited<ReturnType<PDFDocument['embedPdf']>>[number]>()
  for (const piece of rendered) {
    const page = await embedOnePage(output, piece.bytes, `The rendered piece for page ${piece.group.page}`)
    embedded.set(piece.group.key, page)
  }
  for (let paperIndex = 0; paperIndex < imposed.papers; paperIndex += 1) {
    const paper = output.addPage([imposed.paper.width / MM_PER_PT, imposed.paper.height / MM_PER_PT])
    for (const piece of rendered) {
      const image = embedded.get(piece.group.key)
      if (!image) throw new Error(`The rendered piece for page ${piece.group.page} was not embedded.`)
      for (const { placement, layout } of piece.group.placements) {
        if (placement.paper !== paperIndex) continue
        const { draw, clip: clipBox } = placementPdfGeometry(placement, layout, imposed.paper.height)
        drawClippedPage(paper, image, draw, clipBox)
      }
    }
  }
  return output.save()
}

export async function renderPagesPdf(inputs: PageInput[], opts: PagesPdfOptions, services: PagesPdfServices): Promise<Uint8Array> {
  if (inputs.length === 0) throw new RenderRefusedError('There is nothing to render. Pass at least one page to clear this refusal.')
  const pages = inputs.map((input) => Page.parse(input))
  if (!opts.imposition) {
    const rendered = await Promise.all(pages.map((page) => services.pagePdf(page, { ...opts, limits: undefined })))
    return services.enforce(await joinPdfs(rendered), opts.limits)
  }
  const imposition = Imposition.parse(opts.imposition)
  if (opts.preferCssPageSize) {
    throw new RenderRefusedError(
      'Pages in an imposition take their size from its paper. Remove preferCssPageSize, or remove the imposition, to clear this refusal.',
    )
  }
  return services.enforce(await composedPdf(pages, imposition, opts, services), opts.limits)
}
