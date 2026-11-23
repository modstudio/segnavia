import {
  Imposition,
  type ImpositionInput,
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
import { type InputRefusal, RenderInputsRefusedError, RenderRefusedError } from './errors.ts'
import { type ComposedRenderOptions, innerLimits, parseRenderOptions } from './options.ts'
import type { PrintResult } from './overflow.ts'
import { groupPieces, type PieceGeometry, pieceGeometry } from './pages-imposition.ts'
import { composeImposedPdf } from './pdf-compose.ts'
import { pdfBox, pt } from './pdf-geometry.ts'
import { joinPdfs } from './pdf-join.ts'
import { loadPdf } from './pdf-load.ts'
import { setPdfPageSize } from './pdf-page-size.ts'
import { pagesTagged } from './pdf-tagging.ts'
import { isInputScoped, settleRenderInputs } from './render-inputs.ts'
import { slotsForDocument } from './slot-document.ts'
import type { WatermarkPart } from './watermark-stamp.ts'

export type PagesPdfOptions = ComposedRenderOptions & {
  imposition?: ImpositionInput
  skipRefused?: { report(refused: readonly InputRefusal[]): void }
}

interface PagesPdfServices {
  pagePdf(page: HtmlPage | PrintedHtmlPage, slots: PreparedSlots, options: ComposedRenderOptions, inputIndex: number, tagged: boolean): Promise<PrintResult>
  piecePdf(page: HtmlPage, slots: PreparedSlots, geometry: PieceGeometry, css: string, options: ComposedRenderOptions, tagged: boolean): Promise<PrintResult>
  fontFaces(options: ComposedRenderOptions): string
  finish(pdf: Uint8Array, options: Pick<ComposedRenderOptions, 'effects' | 'limits' | 'press'>): Promise<Uint8Array>
  watermark?(parts: readonly WatermarkPart[], pageCount?: number): Promise<Uint8Array[]>
}

const watermarkParts = (services: PagesPdfServices, parts: readonly WatermarkPart[], pageCount?: number) =>
  services.watermark ? services.watermark(parts, pageCount) : Promise.resolve(parts.map((part) => part.bytes))

type PageInputFact = { index: number; id?: string }

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
  pages: HtmlPage[],
  slots: PreparedSlots,
  imposition: Imposition,
  opts: PagesPdfOptions,
  services: PagesPdfServices,
  frameGroups: ReadonlyArray<readonly number[]> = pages.map((_, index) => [index]),
  inputFacts: ReadonlyArray<PageInputFact> = pages.map((page, index) => ({ index, ...(page.id === undefined ? {} : { id: page.id }) })),
): Promise<{ result: PrintResult } | { refused: InputRefusal[] }> {
  const press = sharedImpositionPress(pages)
  const imposed = impose(imposition, pages.length, press)
  const boxes = impositionBoxes(imposition, press)
  const marks = impositionMarks(imposition, press)
  const sides = boxes.map((sideBoxes) => ({ boxes: sideBoxes, marks: marks.find((entry) => entry.side === sideBoxes.side) }))
  const groups = groupPieces(pages, imposed, imposition.fit, opts.pageWidths)
  const baseCss = services.fontFaces(opts)
  const settled = await settleRenderInputs(
    groups.map((group) => ({ group, ...(inputFacts[group.page] ?? { index: group.page }) })),
    async ({ group }) => {
      const page = pages[group.page]
      const first = group.placements[0]
      const pageFrames = frameGroups[group.page]
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
    result: {
      bytes: await composeImposedPdf(
        imposed,
        rendered.map(({ group }, index) => ({
          key: group.key,
          name: `The rendered piece for input ${inputFacts[group.page]?.index ?? group.page}`,
          bytes: watermarked[index] as Uint8Array,
          placements: group.placements,
        })),
        sides,
        imposition.markColor,
      ),
      ...(rendered[0]?.rendered.fontFamily ? { fontFamily: rendered[0].rendered.fontFamily } : {}),
      ...(rendered[0]?.rendered.fontFaceCss ? { fontFaceCss: rendered[0].rendered.fontFaceCss } : {}),
    },
  }
}

async function renderUnimposedPagesPdf(
  pages: Array<HtmlPage | PrintedHtmlPage>,
  slots: PreparedSlots,
  opts: PagesPdfOptions,
  services: PagesPdfServices,
  frameGroups: ReadonlyArray<readonly number[]>,
  outlineSources: ReadonlyArray<OutlineSource | undefined>,
  inputFacts: ReadonlyArray<PageInputFact>,
  priorRefusals: readonly InputRefusal[],
): Promise<RenderedPagesPdf> {
  const tagged = pagesTagged(pages.map(isPrintedHtmlPage), false)
  const settled = await Promise.all(
    pages.map(async (page, inputIndex) => {
      const input = inputFacts[inputIndex] ?? { index: inputIndex, ...(page.id === undefined ? {} : { id: page.id }) }
      try {
        const rendered = await services.pagePdf(
          page,
          slotsForDocument(slots, [frameGroups[inputIndex] ?? []]),
          { ...opts, limits: innerLimits(opts.limits), press: undefined, overflow: undefined },
          input.index,
          tagged,
        )
        return { page, inputIndex, rendered }
      } catch (error) {
        if (!isInputScoped(error)) throw error
        return { page, inputIndex, refusal: { ...input, error } satisfies InputRefusal }
      }
    }),
  )
  const refused = [
    ...priorRefusals,
    ...settled.map((entry) => ('refusal' in entry ? entry.refusal : undefined)).filter((entry): entry is InputRefusal => entry !== undefined),
  ]
  const accepted = settled.filter((entry): entry is Extract<(typeof settled)[number], { rendered: PrintResult }> => 'rendered' in entry)
  if (refused.length > 0 && (!opts.skipRefused || accepted.length === 0)) throw new RenderInputsRefusedError(refused)
  const rendered = accepted.map((entry) => entry.rendered)
  const watermarked = await watermarkParts(
    services,
    accepted.map(({ page, rendered: part }) => ({ ...part, page })),
  )
  const output = await services.finish(
    await joinWithOutlines(
      watermarked,
      accepted.map(({ inputIndex }) => outlineSources[inputIndex]),
    ),
    opts,
  )
  opts.overflow?.report?.({ entries: rendered.flatMap((part) => (part.overflow ? [part.overflow] : [])) })
  return { output, refused }
}

function parsePagesImposition(pages: Array<HtmlPage | PrintedHtmlPage>, opts: PagesPdfOptions): Imposition {
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
  output: Uint8Array
  refused: InputRefusal[]
}

function mergedRefusals(prior: readonly InputRefusal[], current: readonly InputRefusal[]): InputRefusal[] {
  const entries = new Map(prior.map((entry) => [entry.index, entry]))
  for (const entry of current) entries.set(entry.index, entry)
  return [...entries.values()].sort((left, right) => left.index - right.index)
}

function completed(output: Uint8Array, refused: readonly InputRefusal[], opts: PagesPdfOptions): RenderedPagesPdf {
  if (refused.length > 0 && !opts.skipRefused) throw new RenderInputsRefusedError(refused)
  return { output, refused: [...refused] }
}

async function retryImposition(
  pages: Array<HtmlPage | PrintedHtmlPage>,
  slots: PreparedSlots,
  opts: PagesPdfOptions,
  services: PagesPdfServices,
  frameGroups: ReadonlyArray<readonly number[]>,
  outlineSources: ReadonlyArray<OutlineSource | undefined>,
  inputFacts: ReadonlyArray<PageInputFact>,
  priorRefusals: readonly InputRefusal[],
  currentRefusals: readonly InputRefusal[],
  remainingPasses: number,
): Promise<RenderedPagesPdf> {
  const refused = mergedRefusals(priorRefusals, currentRefusals)
  if (!opts.skipRefused) throw new RenderInputsRefusedError(refused)
  const refusedIndexes = new Set(currentRefusals.map(({ index }) => index))
  const positions = inputFacts.flatMap((input, position) => (refusedIndexes.has(input.index) ? [] : [position]))
  if (positions.length === 0 || remainingPasses <= 0) throw new RenderInputsRefusedError(refused)
  return renderPagesPdfPass(
    positions.map((position) => pages[position] as HtmlPage | PrintedHtmlPage),
    slots,
    opts,
    services,
    positions.map((position) => frameGroups[position] ?? []),
    positions.map((position) => outlineSources[position]),
    positions.map((position) => inputFacts[position] as PageInputFact),
    refused,
    remainingPasses - 1,
  )
}

// Pages arrive parsed and filled with the slot preparation that measures their overflow.
export async function renderPagesPdf(
  pages: Array<HtmlPage | PrintedHtmlPage>,
  slots: PreparedSlots,
  opts: PagesPdfOptions,
  services: PagesPdfServices,
  frameGroups: ReadonlyArray<readonly number[]> = pages.map((_, index) => [index]),
  outlineSources: ReadonlyArray<OutlineSource | undefined> = [],
  inputFacts: ReadonlyArray<PageInputFact> = pages.map((page, index) => ({ index, ...(page.id === undefined ? {} : { id: page.id }) })),
  priorRefusals: readonly InputRefusal[] = [],
): Promise<Uint8Array> {
  opts = parseRenderOptions(opts)
  const rendered = await renderPagesPdfPass(pages, slots, opts, services, frameGroups, outlineSources, inputFacts, priorRefusals, pages.length)
  if (rendered.refused.length > 0) opts.skipRefused?.report(rendered.refused)
  return rendered.output
}

async function renderPagesPdfPass(
  pages: Array<HtmlPage | PrintedHtmlPage>,
  slots: PreparedSlots,
  opts: PagesPdfOptions,
  services: PagesPdfServices,
  frameGroups: ReadonlyArray<readonly number[]>,
  outlineSources: ReadonlyArray<OutlineSource | undefined>,
  inputFacts: ReadonlyArray<PageInputFact>,
  priorRefusals: readonly InputRefusal[],
  remainingPasses: number,
): Promise<RenderedPagesPdf> {
  if (pages.length === 0 && priorRefusals.length > 0) throw new RenderInputsRefusedError(priorRefusals)
  if (pages.length === 0) throw new RenderRefusedError('There is nothing to render. Pass at least one page to clear this refusal.')
  if (!opts.imposition) return renderUnimposedPagesPdf(pages, slots, opts, services, frameGroups, outlineSources, inputFacts, priorRefusals)
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
      pages.map((page, position) => ({ page, frames: frameGroups[position] ?? [], ...(inputFacts[position] ?? { index: position }) })),
      async ({ page, frames, index }) => {
        if (!isPrintedHtmlPage(page) && !page.printedPages) {
          const composed = await composedPdf(
            [page],
            slots,
            imposition,
            opts,
            { ...services, watermark: undefined },
            [frames],
            [{ index, ...(page.id ? { id: page.id } : {}) }],
          )
          if ('refused' in composed) throw composed.refused[0]?.error ?? new Error('An imposed input failed without a refusal.')
          return { ...composed.result, page }
        }
        const rendered = await services.pagePdf(
          page,
          slotsForDocument(slots, [frames]),
          { ...opts, limits: innerLimits(opts.limits), press: undefined, overflow: undefined },
          index,
          tagged,
        )
        if (!page.print) throw new Error('An identity-imposed printed page has no print geometry.')
        return { ...rendered, bytes: await declarePrintedPageBoxes(rendered.bytes, page.print), page }
      },
      (input) => input.index,
    )
    if (settled.refused.length > 0) {
      return retryImposition(pages, slots, opts, services, frameGroups, outlineSources, inputFacts, priorRefusals, settled.refused, remainingPasses)
    }
    const parts = settled.accepted.map(({ value }) => value)
    const watermarked = await watermarkParts(
      services,
      parts.map((part) => ({ ...part, page: part.page })),
    )
    const output = await services.finish(await joinWithOutlines(watermarked, outlineSources), opts)
    opts.overflow?.report?.({ entries: parts.flatMap((part) => (part.overflow ? [part.overflow] : [])) })
    return completed(output, priorRefusals, opts)
  }
  if (!pages.every((page): page is HtmlPage => !isPrintedHtmlPage(page))) {
    throw new RenderRefusedError('A sectioned printed page could not be imposed with other pages; print without imposition to clear this refusal.')
  }
  const composed = await composedPdf(pages, slots, imposition, opts, services, frameGroups, inputFacts)
  if ('refused' in composed) {
    return retryImposition(pages, slots, opts, services, frameGroups, outlineSources, inputFacts, priorRefusals, composed.refused, remainingPasses)
  }
  return completed(await services.finish(composed.result.bytes, opts), priorRefusals, opts)
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
