import {
  Imposition,
  type ImpositionInput,
  impose,
  impositionMarks,
  isPrintedPageIdentityImposition,
  mixedImpositionGeometryRefusal,
  printPadding,
  printProperties,
  sharedImpositionPress,
} from '@segnavia/format'
import type { HtmlPage, PreparedSlots } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'
import type { RenderOptions } from './index.ts'
import { innerLimits, parseRenderOptions } from './options.ts'
import type { PrintResult } from './overflow.ts'
import { groupPieces, type PieceGeometry, pieceGeometry } from './pages-imposition.ts'
import { composeImposedPdf } from './pdf-compose.ts'
import { joinPdfs } from './pdf-join.ts'
import { setPdfPageSize } from './pdf-page-size.ts'
import { slotsForDocument } from './slot-document.ts'

export type PagesPdfOptions = RenderOptions & { imposition?: ImpositionInput }

interface PagesPdfServices {
  pagePdf(page: HtmlPage, slots: PreparedSlots, options: RenderOptions, inputIndex: number): Promise<PrintResult>
  piecePdf(page: HtmlPage, slots: PreparedSlots, geometry: PieceGeometry, css: string, options: RenderOptions): Promise<Uint8Array>
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

async function composedPdf(
  pages: HtmlPage[],
  slots: PreparedSlots,
  imposition: Imposition,
  opts: PagesPdfOptions,
  services: PagesPdfServices,
  frameIndexes: readonly number[] = pages.map((_, index) => index),
): Promise<Uint8Array> {
  const press = sharedImpositionPress(pages)
  const imposed = impose(imposition, pages.length, press)
  const marks = impositionMarks(imposition, press)
  opts.marks?.report?.({ omittedMarks: marks.flatMap((side) => side.omittedMarks) })
  const groups = groupPieces(pages, imposed, imposition.fit, opts.pageWidths)
  const baseCss = services.fontFaces(opts)
  const rendered = await Promise.all(
    groups.map(async (group) => {
      const page = pages[group.page]
      const first = group.placements[0]
      const frameIndex = frameIndexes[group.page]
      if (!page || !first || frameIndex === undefined) throw new Error(`The piece for page ${group.page} has no placement.`)
      const geometry = pieceGeometry(first)
      const css = `${page.print ? printProperties(page.print) : ''}${geometry.padding ? printPadding(geometry.padding) : ''}${baseCss}`
      try {
        return {
          group,
          bytes: await setPdfPageSize(
            await services.piecePdf(page, slotsForDocument(slots, [[frameIndex]]), geometry, css, {
              ...opts,
              limits: innerLimits(opts.limits),
            }),
            geometry.paper,
            'An imposition piece prints at its paper, so the content or a CSS rule changed the paper Chromium produced; remove an @page size rule or the rule that resizes the page to clear this refusal.',
          ),
        }
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
    imposition.markColor,
  )
}

// Pages arrive parsed and filled with the slot preparation that measures their overflow.
export async function renderPagesPdf(pages: HtmlPage[], slots: PreparedSlots, opts: PagesPdfOptions, services: PagesPdfServices): Promise<Uint8Array> {
  opts = parseRenderOptions(opts)
  if (pages.length === 0) throw new RenderRefusedError('There is nothing to render. Pass at least one page to clear this refusal.')
  if (!opts.imposition) {
    const rendered = await Promise.all(
      pages.map((page, inputIndex) =>
        services.pagePdf(
          page,
          slotsForDocument(slots, [[inputIndex]]),
          { ...opts, limits: innerLimits(opts.limits), press: undefined, overflow: undefined },
          inputIndex,
        ),
      ),
    )
    const output = await services.finish(await joinPdfs(rendered.map((part) => part.bytes)), opts)
    opts.overflow?.report?.({ entries: rendered.flatMap((part) => (part.overflow ? [part.overflow] : [])) })
    return output
  }
  const imposition = Imposition.parse(opts.imposition)
  const geometryRefusal = mixedImpositionGeometryRefusal(pages)
  if (geometryRefusal) throw new RenderRefusedError(geometryRefusal)
  if (opts.preferCssPageSize) {
    throw new RenderRefusedError(
      'Pages in an imposition take their size from its paper. Remove preferCssPageSize, or remove the imposition, to clear this refusal.',
    )
  }
  const printed = pages.filter((page) => page.printedPages)
  if (printed.length > 0) {
    if (printed.some((page) => !page.print || !isPrintedPageIdentityImposition(page.print, imposition))) {
      throw new RenderRefusedError(
        'Printed pages could not establish one unchanged page per paper under this imposition; print without imposition to clear this refusal.',
      )
    }
    const overflow: NonNullable<PrintResult['overflow']>[] = []
    const parts = await Promise.all(
      pages.map(async (page, inputIndex) => {
        if (!page.printedPages) return composedPdf([page], slots, imposition, opts, services, [inputIndex])
        const rendered = await services.pagePdf(
          page,
          slotsForDocument(slots, [[inputIndex]]),
          { ...opts, limits: innerLimits(opts.limits), press: undefined, overflow: undefined },
          inputIndex,
        )
        if (rendered.overflow) overflow.push(rendered.overflow)
        return rendered.bytes
      }),
    )
    const output = await services.finish(await joinPdfs(parts), opts)
    opts.overflow?.report?.({ entries: overflow })
    return output
  }
  return services.finish(await composedPdf(pages, slots, imposition, opts, services), opts)
}
