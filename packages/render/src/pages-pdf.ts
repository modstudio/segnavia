import { Imposition, type ImpositionInput, impose, impositionMarks, type Page, printPadding, printProperties } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import type { RenderOptions } from './index.ts'
import type { PrintResult } from './overflow.ts'
import { groupPieces, type PieceGeometry, pieceGeometry } from './pages-imposition.ts'
import { composeImposedPdf } from './pdf-compose.ts'
import { joinPdfs } from './pdf-join.ts'

export type PagesPdfOptions = RenderOptions & { imposition?: ImpositionInput }

interface PagesPdfServices {
  pagePdf(page: Page, options: RenderOptions, inputIndex: number): Promise<PrintResult>
  piecePdf(page: Page, geometry: PieceGeometry, css: string, options: RenderOptions): Promise<Uint8Array>
  fontFaces(options: RenderOptions): string
  finish(pdf: Uint8Array, options: Pick<RenderOptions, 'effects' | 'limits' | 'press'>): Promise<Uint8Array>
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
  const marks = impositionMarks(imposition)
  opts.marks?.report?.({ omittedMarks: marks.flatMap((side) => side.omittedMarks) })
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
  return composeImposedPdf(
    imposed,
    rendered.map(({ group, bytes }) => ({
      key: group.key,
      name: `The rendered piece for page ${group.page}`,
      bytes,
      placements: group.placements,
    })),
    marks,
  )
}

// Pages arrive parsed and filled. Each filled page object keys its slot preparation, so parsing again here would
// hand the renderer new objects and lose the preparation, and with it overflow measurement and its refusals.
export async function renderPagesPdf(pages: Page[], opts: PagesPdfOptions, services: PagesPdfServices): Promise<Uint8Array> {
  if (pages.length === 0) throw new RenderRefusedError('There is nothing to render. Pass at least one page to clear this refusal.')
  if (!opts.imposition) {
    const rendered = await Promise.all(
      pages.map((page, inputIndex) =>
        services.pagePdf(page, { ...opts, effects: false, limits: undefined, press: undefined, overflow: undefined }, inputIndex),
      ),
    )
    const output = await services.finish(await joinPdfs(rendered.map((part) => part.bytes)), opts)
    opts.overflow?.report?.({ entries: rendered.flatMap((part) => (part.overflow ? [part.overflow] : [])) })
    return output
  }
  const imposition = Imposition.parse(opts.imposition)
  if (opts.preferCssPageSize) {
    throw new RenderRefusedError(
      'Pages in an imposition take their size from its paper. Remove preferCssPageSize, or remove the imposition, to clear this refusal.',
    )
  }
  return services.finish(await composedPdf(pages, imposition, opts, services), opts)
}
