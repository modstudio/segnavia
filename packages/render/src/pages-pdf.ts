import {
  Imposition,
  type ImpositionInput,
  impose,
  impositionBoxes,
  impositionMarks,
  isPrintedPageIdentityImposition,
  mixedImpositionGeometryRefusal,
  type Print,
  printBoxes,
  printPadding,
  printProperties,
  sharedImpositionPress,
} from '@segnavia/format'
import { type HtmlPage, isPrintedHtmlPage, type PreparedSlots, type PrintedHtmlPage } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'
import { type ComposedRenderOptions, innerLimits, parseRenderOptions } from './options.ts'
import type { PrintResult } from './overflow.ts'
import { groupPieces, type PieceGeometry, pieceGeometry } from './pages-imposition.ts'
import { composeImposedPdf } from './pdf-compose.ts'
import { pdfBox } from './pdf-geometry.ts'
import { joinPdfs } from './pdf-join.ts'
import { loadPdf } from './pdf-load.ts'
import { setPdfPageSize } from './pdf-page-size.ts'
import { slotsForDocument } from './slot-document.ts'
import type { WatermarkPart } from './watermark-stamp.ts'

export type PagesPdfOptions = ComposedRenderOptions & { imposition?: ImpositionInput }

interface PagesPdfServices {
  pagePdf(page: HtmlPage | PrintedHtmlPage, slots: PreparedSlots, options: ComposedRenderOptions, inputIndex: number): Promise<PrintResult>
  piecePdf(page: HtmlPage, slots: PreparedSlots, geometry: PieceGeometry, css: string, options: ComposedRenderOptions): Promise<Uint8Array>
  fontFaces(options: ComposedRenderOptions): string
  finish(pdf: Uint8Array, options: Pick<ComposedRenderOptions, 'effects' | 'limits' | 'press'>): Promise<Uint8Array>
  watermark?(parts: readonly WatermarkPart[], pageCount?: number): Promise<Uint8Array[]>
}

const watermarkParts = (services: PagesPdfServices, parts: readonly WatermarkPart[], pageCount?: number) =>
  services.watermark ? services.watermark(parts, pageCount) : Promise.resolve(parts.map((part) => part.bytes))

function namePageError(error: unknown, page: number): never {
  if (error instanceof Error) {
    error.message = `Page at index ${page} could not be rendered: ${error.message}`
    throw error
  }
  throw new Error(`Page at index ${page} could not be rendered: ${String(error)}`)
}

async function declarePrintedPageBoxes(pdf: Uint8Array, print: Print): Promise<Uint8Array> {
  const document = await loadPdf(pdf)
  const boxes = printBoxes(print)
  const trim = pdfBox(boxes.trim, boxes.media.height)
  const bleed = pdfBox(boxes.bleedBox, boxes.media.height)
  for (const page of document.getPages()) {
    page.setTrimBox(trim.x, trim.y, trim.width, trim.height)
    page.setBleedBox(bleed.x, bleed.y, bleed.width, bleed.height)
  }
  return document.save()
}

async function composedPdf(
  pages: HtmlPage[],
  slots: PreparedSlots,
  imposition: Imposition,
  opts: PagesPdfOptions,
  services: PagesPdfServices,
  frameGroups: ReadonlyArray<readonly number[]> = pages.map((_, index) => [index]),
): Promise<Uint8Array> {
  const press = sharedImpositionPress(pages)
  const imposed = impose(imposition, pages.length, press)
  const boxes = impositionBoxes(imposition, press)
  const marks = impositionMarks(imposition, press)
  const sides = boxes.map((sideBoxes) => ({ boxes: sideBoxes, marks: marks.find((entry) => entry.side === sideBoxes.side) }))
  opts.marks?.report?.({ omittedMarks: marks.flatMap((side) => side.omittedMarks) })
  const groups = groupPieces(pages, imposed, imposition.fit, opts.pageWidths)
  const baseCss = services.fontFaces(opts)
  const rendered = await Promise.all(
    groups.map(async (group) => {
      const page = pages[group.page]
      const first = group.placements[0]
      const pageFrames = frameGroups[group.page]
      if (!page || !first || pageFrames === undefined) throw new Error(`The piece for page ${group.page} has no placement.`)
      const geometry = pieceGeometry(first)
      const css = `${page.print ? printProperties(page.print) : ''}${geometry.padding ? printPadding(geometry.padding) : ''}${baseCss}`
      try {
        return {
          group,
          bytes: await setPdfPageSize(
            await services.piecePdf(page, slotsForDocument(slots, [pageFrames]), geometry, css, {
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
  const watermarked = await watermarkParts(
    services,
    rendered.map(({ group, bytes }) => ({ bytes, page: pages[group.page] as HtmlPage, physicalPages: [group.page + 1] })),
    pages.length,
  )
  return composeImposedPdf(
    imposed,
    rendered.map(({ group }, index) => ({
      key: group.key,
      name: `The rendered piece for page ${group.page}`,
      bytes: watermarked[index] as Uint8Array,
      placements: group.placements,
    })),
    sides,
    imposition.markColor,
  )
}

// Pages arrive parsed and filled with the slot preparation that measures their overflow.
export async function renderPagesPdf(
  pages: Array<HtmlPage | PrintedHtmlPage>,
  slots: PreparedSlots,
  opts: PagesPdfOptions,
  services: PagesPdfServices,
  frameGroups: ReadonlyArray<readonly number[]> = pages.map((_, index) => [index]),
): Promise<Uint8Array> {
  opts = parseRenderOptions(opts)
  if (pages.length === 0) throw new RenderRefusedError('There is nothing to render. Pass at least one page to clear this refusal.')
  if (!opts.imposition) {
    const rendered = await Promise.all(
      pages.map((page, inputIndex) =>
        services.pagePdf(
          page,
          slotsForDocument(slots, [frameGroups[inputIndex] ?? []]),
          { ...opts, limits: innerLimits(opts.limits), press: undefined, overflow: undefined },
          inputIndex,
        ),
      ),
    )
    const watermarked = await watermarkParts(
      services,
      rendered.map((part, index) => ({ bytes: part.bytes, page: pages[index] as HtmlPage | PrintedHtmlPage })),
    )
    const output = await services.finish(await joinPdfs(watermarked), opts)
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
        if (!isPrintedHtmlPage(page) && !page.printedPages) {
          return composedPdf([page], slots, imposition, opts, services, [frameGroups[inputIndex] ?? []])
        }
        const rendered = await services.pagePdf(
          page,
          slotsForDocument(slots, [frameGroups[inputIndex] ?? []]),
          { ...opts, limits: innerLimits(opts.limits), press: undefined, overflow: undefined },
          inputIndex,
        )
        if (rendered.overflow) overflow.push(rendered.overflow)
        if (!page.print) throw new Error('An identity-imposed printed page has no print geometry.')
        return declarePrintedPageBoxes(rendered.bytes, page.print)
      }),
    )
    const watermarked = await watermarkParts(
      services,
      parts.map((bytes, index) => ({ bytes, page: pages[index] as HtmlPage | PrintedHtmlPage })),
    )
    const output = await services.finish(await joinPdfs(watermarked), opts)
    opts.overflow?.report?.({ entries: overflow })
    return output
  }
  if (!pages.every((page): page is HtmlPage => !isPrintedHtmlPage(page))) {
    throw new RenderRefusedError('A sectioned printed page could not be imposed with other pages; print without imposition to clear this refusal.')
  }
  return services.finish(await composedPdf(pages, slots, imposition, opts, services, frameGroups), opts)
}
