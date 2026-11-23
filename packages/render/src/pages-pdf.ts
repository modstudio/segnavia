import {
  Imposition,
  impose,
  impositionBoxes,
  impositionMarks,
  isPrintedPageIdentityImposition,
  mixedImpositionGeometryRefusal,
  type OutlineSource,
  type Print,
  printBoxes,
  printedSectionPapers,
  printPadding,
  printProperties,
  sharedImpositionPress,
} from '@segnavia/format'
import { type HtmlPage, isPrintedHtmlPage, type PreparedSlots, type PrintedHtmlPage } from '@segnavia/html'
import { type BookDestination, namedDestinations } from './book-destinations.ts'
import { writeDocumentOutlines } from './book-structure.ts'
import { type InputRefusal, type RenderInputRef, RenderInputsRefusedError, RenderRefusedError } from './errors.ts'
import { inputRefusalLedger, refuseOrContinue } from './input-refusal-ledger.ts'
import { type ComposedRenderOptions, innerLimits, parseRenderOptions } from './options.ts'
import type { PrintResult } from './overflow.ts'
import { groupPieces, type PieceGeometry, pieceGeometry } from './pages-imposition.ts'
import { composeImposedPdf } from './pdf-compose.ts'
import { pdfBox, pt } from './pdf-geometry.ts'
import { joinPdfs } from './pdf-join.ts'
import { loadPdf } from './pdf-load.ts'
import { setPdfPageSize } from './pdf-page-size.ts'
import { pagesTagged } from './pdf-tagging.ts'
import type { RenderProgressReporter } from './progress.ts'
import { renderInputRef, settleRenderInputs } from './render-inputs.ts'
import type { ParsedPagesPdfOptions } from './renderer.ts'
import { slotsForDocument } from './slot-document.ts'
import type { WatermarkPart } from './watermark-stamp.ts'

type RenderPagesPdfOptions = ComposedRenderOptions & Pick<ParsedPagesPdfOptions, 'imposition' | 'skipRefused'>

interface PagesPdfServices {
  pagePdf(page: HtmlPage | PrintedHtmlPage, slots: PreparedSlots, options: ComposedRenderOptions, inputIndex: number, tagged: boolean): Promise<PrintResult>
  piecePdf(page: HtmlPage, slots: PreparedSlots, geometry: PieceGeometry, css: string, options: ComposedRenderOptions, tagged: boolean): Promise<PrintResult>
  fontFaces(options: ComposedRenderOptions): string
  finish(pdf: Uint8Array, options: Pick<ComposedRenderOptions, 'effects' | 'limits' | 'press'>): Promise<Uint8Array>
  watermark?(parts: readonly WatermarkPart[], pageCount?: number): Promise<Uint8Array[]>
  progress?: RenderProgressReporter
}

const watermarkParts = (services: PagesPdfServices, parts: readonly WatermarkPart[], pageCount?: number) =>
  services.watermark ? services.watermark(parts, pageCount) : Promise.resolve(parts.map((part) => part.bytes))

export interface RenderPagesPdfInput {
  ref: RenderInputRef
  page: HtmlPage | PrintedHtmlPage
  frames: readonly number[]
  outlineSource?: OutlineSource
}

export function renderPagesPdfInputs(
  pages: Array<HtmlPage | PrintedHtmlPage>,
  frameGroups: ReadonlyArray<readonly number[]> = pages.map((_, index) => [index]),
  outlineSources: ReadonlyArray<OutlineSource | undefined> = [],
  refs: ReadonlyArray<RenderInputRef> = pages.map(renderInputRef),
): RenderPagesPdfInput[] {
  return pages.map((page, position) => ({
    ref: refs[position] ?? renderInputRef(page, position),
    page,
    frames: frameGroups[position] ?? [],
    ...(outlineSources[position] ? { outlineSource: outlineSources[position] } : {}),
  }))
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

async function declarePieceTrimBox(pdf: Uint8Array, geometry: PieceGeometry): Promise<Uint8Array> {
  if (!geometry.padding) return pdf
  const document = await loadPdf(pdf)
  for (const page of document.getPages()) {
    const media = page.getMediaBox()
    const left = pt(geometry.padding.left)
    const bottom = pt(geometry.padding.bottom)
    page.setTrimBox(media.x + left, media.y + bottom, media.width - left - pt(geometry.padding.right), media.height - bottom - pt(geometry.padding.top))
  }
  return document.save()
}

async function composedPdf(
  inputs: Array<RenderPagesPdfInput & { page: HtmlPage }>,
  slots: PreparedSlots,
  imposition: Imposition,
  opts: RenderPagesPdfOptions,
  services: PagesPdfServices,
): Promise<RenderedPagesPdf> {
  const pages = inputs.map(({ page }) => page)
  const press = sharedImpositionPress(pages)
  const imposed = impose(imposition, pages.length, press)
  const boxes = impositionBoxes(imposition, press)
  const marks = impositionMarks(imposition, press)
  const sides = boxes.map((sideBoxes) => ({ boxes: sideBoxes, marks: marks.find((entry) => entry.side === sideBoxes.side) }))
  const groups = groupPieces(pages, imposed, imposition.fit, opts.pageWidths)
  const baseCss = services.fontFaces(opts)
  const settled = await settleRenderInputs(
    groups.map((group) => ({ group, ...(inputs[group.page]?.ref ?? { index: group.page }) })),
    async ({ group }) => {
      const input = inputs[group.page]
      const page = input?.page
      const first = group.placements[0]
      const pageFrames = input?.frames
      if (!page || !first || pageFrames === undefined) throw new Error(`The piece for page ${group.page} has no placement.`)
      const geometry = pieceGeometry(first)
      const css = `${page.print ? printProperties(page.print) : ''}${geometry.padding ? printPadding(geometry.padding) : ''}${baseCss}`
      const piece = await services.piecePdf(
        page,
        slotsForDocument(slots, [pageFrames]),
        geometry,
        css,
        {
          ...opts,
          limits: innerLimits(opts.limits),
        },
        pagesTagged([isPrintedHtmlPage(page)], true),
      )
      services.progress?.report('set', 1, 1, input.ref.index)
      return {
        group,
        rendered: {
          ...piece,
          bytes: await declarePieceTrimBox(
            await setPdfPageSize(
              piece.bytes,
              geometry.paper,
              'An imposition piece prints at its paper, so the content or a CSS rule changed the paper Chromium produced; remove an @page size rule or the rule that resizes the page to clear this refusal.',
            ),
            geometry,
          ),
        },
      }
    },
    (input) => input.index,
  )
  if (settled.refused.length > 0) return { refused: settled.refused }
  opts.marks?.report?.({ omittedMarks: marks.flatMap((side) => side.omittedMarks) })
  const rendered = settled.accepted.map(({ value }) => value)
  const watermarked = await watermarkParts(
    services,
    rendered.map(({ group, rendered: part }) => ({
      ...part,
      page: pages[group.page] as HtmlPage,
      physicalPages: [group.page + 1],
    })),
    pages.length,
  )
  return {
    output: await composeImposedPdf(
      imposed,
      rendered.map(({ group }, index) => ({
        key: group.key,
        name: `The rendered piece for input ${inputs[group.page]?.ref.index ?? group.page}`,
        bytes: watermarked[index] as Uint8Array,
        placements: group.placements,
      })),
      sides,
      imposition.markColor,
      (done, total) => services.progress?.report('impose', done, total),
    ),
    refused: [],
  }
}

async function renderUnimposedPagesPdf(
  inputs: RenderPagesPdfInput[],
  slots: PreparedSlots,
  opts: RenderPagesPdfOptions,
  services: PagesPdfServices,
  priorRefusals: readonly InputRefusal[],
): Promise<RenderedPagesPdf> {
  const pages = inputs.map(({ page }) => page)
  const tagged = pagesTagged(pages.map(isPrintedHtmlPage), false)
  const settled = await settleRenderInputs(
    inputs.map((input) => ({ ...input.ref, input })),
    async ({ input }) => ({
      input,
      rendered: await services.pagePdf(
        input.page,
        slotsForDocument(slots, [input.frames]),
        { ...opts, limits: innerLimits(opts.limits), press: undefined, overflow: undefined },
        input.ref.index,
        tagged,
      ),
    }),
    (input) => input.index,
  )
  const ledger = inputRefusalLedger(priorRefusals)
  ledger.add(settled.refused)
  const refused = refuseOrContinue(ledger, settled.accepted.length, Boolean(opts.skipRefused))
  const accepted = settled.accepted.map(({ value }) => value)
  const rendered = accepted.map(({ rendered }) => rendered)
  const watermarked = await watermarkParts(
    services,
    accepted.map(({ input, rendered: part }) => ({ ...part, page: input.page })),
  )
  const output = await services.finish(
    await joinWithOutlines(
      watermarked,
      accepted.map(({ input }) => input.outlineSource),
    ),
    opts,
  )
  opts.overflow?.report?.({ entries: rendered.flatMap((part) => (part.overflow ? [part.overflow] : [])) })
  return { output, refused }
}

function parsePagesImposition(pages: Array<HtmlPage | PrintedHtmlPage>, opts: RenderPagesPdfOptions): Imposition {
  const imposition = Imposition.parse(opts.imposition)
  for (const page of pages) {
    if (!isPrintedHtmlPage(page)) continue
    const refusal = mixedImpositionGeometryRefusal(printedSectionPapers(page))
    if (refusal) throw new RenderRefusedError(refusal)
  }
  const geometryRefusal = mixedImpositionGeometryRefusal(pages)
  if (geometryRefusal) throw new RenderRefusedError(geometryRefusal)
  if (opts.preferCssPageSize) {
    throw new RenderRefusedError(
      'Pages in an imposition take their size from its paper. Remove preferCssPageSize, or remove the imposition, to clear this refusal.',
    )
  }
  return imposition
}

interface RenderedPagesPdf {
  output?: Uint8Array
  refused: InputRefusal[]
}

function completed(output: Uint8Array, ledger: ReturnType<typeof inputRefusalLedger>, survivors: number, opts: RenderPagesPdfOptions): RenderedPagesPdf {
  return { output, refused: refuseOrContinue(ledger, survivors, Boolean(opts.skipRefused)) }
}

async function retryImposition(
  inputs: RenderPagesPdfInput[],
  slots: PreparedSlots,
  opts: RenderPagesPdfOptions,
  services: PagesPdfServices,
  ledger: ReturnType<typeof inputRefusalLedger>,
  currentRefusals: readonly InputRefusal[],
  remainingPasses: number,
): Promise<RenderedPagesPdf> {
  ledger.add(currentRefusals)
  refuseOrContinue(ledger, inputs.length - currentRefusals.length, Boolean(opts.skipRefused))
  const refusedIndexes = new Set(currentRefusals.map(({ index }) => index))
  const survivors = inputs.filter((input) => !refusedIndexes.has(input.ref.index))
  if (survivors.length === 0 || remainingPasses <= 0) throw new RenderInputsRefusedError(ledger.entries())
  return renderPagesPdfPass(survivors, slots, opts, services, ledger, remainingPasses - 1)
}

// Pages arrive parsed and filled with the slot preparation that measures their overflow.
export async function renderPagesPdf(
  pages: Array<HtmlPage | PrintedHtmlPage>,
  slots: PreparedSlots,
  opts: RenderPagesPdfOptions,
  services: PagesPdfServices,
  inputs: RenderPagesPdfInput[] = renderPagesPdfInputs(pages),
  priorRefusals: readonly InputRefusal[] = [],
): Promise<Uint8Array> {
  opts = parseRenderOptions(opts)
  const rendered = await renderPagesPdfPass(inputs, slots, opts, services, inputRefusalLedger(priorRefusals), inputs.length)
  if (rendered.refused.length > 0) opts.skipRefused?.report(rendered.refused)
  if (!rendered.output) throw new RenderInputsRefusedError(rendered.refused)
  return rendered.output
}

async function renderPagesPdfPass(
  inputs: RenderPagesPdfInput[],
  slots: PreparedSlots,
  opts: RenderPagesPdfOptions,
  services: PagesPdfServices,
  ledger: ReturnType<typeof inputRefusalLedger>,
  remainingPasses: number,
): Promise<RenderedPagesPdf> {
  const pages = inputs.map(({ page }) => page)
  if (pages.length === 0 && ledger.entries().length > 0) throw new RenderInputsRefusedError(ledger.entries())
  if (pages.length === 0) throw new RenderRefusedError('There is nothing to render. Pass at least one page to clear this refusal.')
  if (!opts.imposition) return renderUnimposedPagesPdf(inputs, slots, opts, services, ledger.entries())
  const imposition = parsePagesImposition(pages, opts)
  const printed = pages.filter((page) => page.printedPages)
  if (printed.length > 0) {
    if (printed.some((page) => !page.print || !isPrintedPageIdentityImposition(page.print, imposition))) {
      throw new RenderRefusedError(
        'Printed pages could not establish one unchanged page per paper under this imposition; print without imposition to clear this refusal.',
      )
    }
    const tagged = pagesTagged(
      pages.map(isPrintedHtmlPage),
      pages.some((page) => !isPrintedHtmlPage(page)),
    )
    const settled = await settleRenderInputs(
      inputs.map((input) => ({ ...input.ref, input })),
      async ({ input }) => {
        const { page, frames, ref } = input
        if (!isPrintedHtmlPage(page) && !page.printedPages) {
          const composed = await composedPdf([{ ...input, page }], slots, imposition, opts, { ...services, watermark: undefined })
          if (!composed.output) return { page, refused: composed.refused }
          return { bytes: composed.output, page }
        }
        const rendered = await services.pagePdf(
          page,
          slotsForDocument(slots, [frames]),
          { ...opts, limits: innerLimits(opts.limits), press: undefined, overflow: undefined },
          ref.index,
          tagged,
        )
        if (!page.print) throw new Error('An identity-imposed printed page has no print geometry.')
        return { ...rendered, bytes: await declarePrintedPageBoxes(rendered.bytes, page.print), page }
      },
      (input) => input.index,
    )
    const nestedRefusals = settled.accepted.flatMap(({ value }) => ('refused' in value && value.refused ? value.refused : []))
    const currentRefusals = [...settled.refused, ...nestedRefusals]
    if (currentRefusals.length > 0) return retryImposition(inputs, slots, opts, services, ledger, currentRefusals, remainingPasses)
    const parts = settled.accepted.flatMap(({ value }) => ('bytes' in value ? [value] : []))
    const watermarked = await watermarkParts(
      services,
      parts.map((part) => ({ ...part, page: part.page })),
    )
    const output = await services.finish(
      await joinWithOutlines(
        watermarked,
        inputs.map(({ outlineSource }) => outlineSource),
      ),
      opts,
    )
    services.progress?.report('impose', 1, 1)
    opts.overflow?.report?.({ entries: parts.flatMap((part) => (part.overflow ? [part.overflow] : [])) })
    return completed(output, ledger, inputs.length, opts)
  }
  if (!pages.every((page): page is HtmlPage => !isPrintedHtmlPage(page))) {
    throw new RenderRefusedError('A sectioned printed page could not be imposed with other pages; print without imposition to clear this refusal.')
  }
  const composed = await composedPdf(inputs as Array<RenderPagesPdfInput & { page: HtmlPage }>, slots, imposition, opts, services)
  if (!composed.output) return retryImposition(inputs, slots, opts, services, ledger, composed.refused, remainingPasses)
  return completed(await services.finish(composed.output, opts), ledger, inputs.length, opts)
}

async function joinWithOutlines(parts: Uint8Array[], sources: ReadonlyArray<OutlineSource | undefined>): Promise<Uint8Array> {
  const inputs: Array<{ source: OutlineSource; destinations: Map<string, BookDestination> }> = []
  let offset = 0
  for (const [index, bytes] of parts.entries()) {
    const source = sources[index]
    const document = await loadPdf(bytes)
    if (source) {
      const destinations = new Map([...namedDestinations(document)].map(([id, destination]) => [id, { ...destination, page: destination.page + offset }]))
      inputs.push({ source, destinations })
    }
    offset += document.getPageCount()
  }
  const joined = await loadPdf(await joinPdfs(parts))
  writeDocumentOutlines(joined, inputs)
  return joined.save()
}
