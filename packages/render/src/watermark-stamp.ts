import { frameStyleSheets } from '@segnavia/frame/bridge'
import { type HtmlPage, type PrintedHtmlPage, printedPageDirection } from '@segnavia/html'
import { endMarkedContent, type PDFArray, PDFName, PDFNumber, PDFOperator } from 'pdf-lib'
import type { TabRunner } from './browser-tab.ts'
import { RenderRefusedError } from './errors.ts'
import { assetSetup } from './options.ts'
import { createPdf, loadPdf } from './pdf-load.ts'
import type { RenderDeadline } from './render-deadline.ts'
import type { ParsedPagePdfOptions } from './renderer.ts'
import { type WatermarkPage, watermarkDocument } from './watermark-markup.ts'
import { watermarkPageNumbers } from './watermark-options.ts'

export interface WatermarkPart {
  bytes: Uint8Array
  page: HtmlPage | PrintedHtmlPage
  physicalPages?: readonly number[]
}

export async function watermarkPages(pdf: Uint8Array): Promise<WatermarkPage[]> {
  const document = await loadPdf(pdf)
  return document.getPages().map((page) => {
    const media = page.getMediaBox()
    const trim = page.getTrimBox()
    return {
      media: { width: media.width, height: media.height },
      trim: { x: trim.x - media.x, y: trim.y - media.y, width: trim.width, height: trim.height },
      direction: 'ltr' as const,
    }
  })
}

export async function stampWatermark(pdf: Uint8Array, layer: Uint8Array, pages: readonly number[]): Promise<Uint8Array> {
  if (pages.length === 0) return pdf
  const output = await loadPdf(pdf)
  const source = await loadPdf(layer)
  if (source.getPageCount() !== pages.length) {
    throw new RenderRefusedError(
      `The watermark layer has ${source.getPageCount()} pages for ${pages.length} selected output pages; rebuild the watermark layer to clear this refusal.`,
    )
  }
  for (const [layerIndex, pageNumber] of pages.entries()) {
    const page = output.getPage(pageNumber - 1)
    const layerPage = source.getPage(layerIndex)
    if (!page || !layerPage) {
      throw new RenderRefusedError(`The watermark layer could not be matched to physical page ${pageNumber}; rebuild the output to clear this refusal.`)
    }
    const media = page.getMediaBox()
    const trim = page.getTrimBox()
    const [embedded] = await output.embedPdf(source, [layerIndex])
    if (!embedded)
      throw new RenderRefusedError(`The watermark layer page for physical page ${pageNumber} could not be embedded; rebuild it to clear this refusal.`)
    const bbox = output.context.obj([
      PDFNumber.of(trim.x),
      PDFNumber.of(trim.y),
      PDFNumber.of(trim.x + trim.width),
      PDFNumber.of(trim.y + trim.height),
    ]) as PDFArray
    const properties = output.context.obj({ Type: 'Pagination', Subtype: 'Watermark', BBox: bbox })
    page.pushOperators(PDFOperator.of('BDC' as never, [PDFName.of('Artifact'), properties as never]))
    page.drawPage(embedded, { x: media.x, y: media.y, width: media.width, height: media.height })
    page.pushOperators(endMarkedContent())
  }
  return output.save()
}

export async function stampWatermarkParts(
  parts: readonly Uint8Array[],
  layer: Uint8Array,
  selected: readonly { part: number; page: number }[],
): Promise<Uint8Array[]> {
  if (selected.length === 0) return [...parts]
  const layerDocument = await loadPdf(layer)
  if (layerDocument.getPageCount() !== selected.length) {
    throw new RenderRefusedError(
      `The watermark layer has ${layerDocument.getPageCount()} pages for ${selected.length} selected reader pages; rebuild the watermark layer to clear this refusal.`,
    )
  }
  const byPart = new Map<number, Array<{ page: number; layer: number }>>()
  for (const [layerIndex, selection] of selected.entries()) {
    const entries = byPart.get(selection.part) ?? []
    entries.push({ page: selection.page, layer: layerIndex })
    byPart.set(selection.part, entries)
  }
  return Promise.all(
    parts.map(async (part, partIndex) => {
      const entries = byPart.get(partIndex)
      if (!entries) return part
      const subset = await createPdf()
      const copied = await subset.copyPages(
        layerDocument,
        entries.map((entry) => entry.layer),
      )
      for (const page of copied) subset.addPage(page)
      return stampWatermark(
        part,
        await subset.save(),
        entries.map((entry) => entry.page),
      )
    }),
  )
}

export async function applyWatermark(
  parts: readonly WatermarkPart[],
  options: ParsedPagePdfOptions,
  fontCss: string,
  deadline: RenderDeadline,
  withTab: TabRunner,
  pageCount?: number,
  physicalPageOffset = 0,
  reportPageCount?: (count: number) => void,
  validateSelection = true,
): Promise<Uint8Array[]> {
  if (!options.watermark) return parts.map((part) => part.bytes)
  const geometries = await Promise.all(parts.map((part) => watermarkPages(part.bytes)))
  let nextPhysicalPage = physicalPageOffset + 1
  const mapped = geometries.flatMap((partPages, partIndex) => {
    const part = parts[partIndex]
    if (!part) return []
    const physical = part.physicalPages?.map((page) => page + physicalPageOffset) ?? partPages.map(() => nextPhysicalPage++)
    return partPages.map((page, pageIndex) => ({
      part: partIndex,
      page: pageIndex + 1,
      physical: physical[pageIndex] as number,
      geometry: { ...page, direction: printedPageDirection(part.page), ...(part.page.lang ? { lang: part.page.lang } : {}) },
    }))
  })
  const count = pageCount ?? mapped.length
  reportPageCount?.(count)
  const selectedNumbers = new Set(
    validateSelection
      ? watermarkPageNumbers(options.watermark, physicalPageOffset + count)
      : options.watermark.pages === undefined || options.watermark.pages === 'all'
        ? mapped.map((entry) => entry.physical)
        : options.watermark.pages,
  )
  const selected = mapped.filter((entry) => selectedNumbers.has(entry.physical))
  if (selected.length === 0) return parts.map((part) => part.bytes)
  const documentCss = parts.map((part) => frameStyleSheets(part.page.style, part.page.brand).join('')).join('')
  const html = watermarkDocument(
    options.watermark,
    selected.map((entry) => entry.geometry),
    `${documentCss}${options.css ?? ''}${fontCss}`,
  )
  const layer = await withTab(
    {
      viewport: { width: 1024, height: 768 },
      scripts: false,
      html,
      readiness: { author: false, diagrams: false },
      deadline,
      ...assetSetup(options),
    },
    (tab) =>
      tab.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      }),
  )
  return stampWatermarkParts(
    parts.map((part) => part.bytes),
    layer,
    selected.map((entry) => ({ part: entry.part, page: entry.page })),
  )
}

export function watermarkCopyStamper(options: ParsedPagePdfOptions, fontCss: string, deadline: RenderDeadline, withTab: TabRunner) {
  let physicalPageOffset = 0
  return {
    stamp: async (parts: readonly WatermarkPart[], pageCount?: number): Promise<Uint8Array[]> => {
      let renderedPageCount = 0
      const output = await applyWatermark(
        parts,
        options,
        fontCss,
        deadline,
        withTab,
        pageCount,
        physicalPageOffset,
        (value) => {
          renderedPageCount = value
        },
        false,
      )
      physicalPageOffset += renderedPageCount
      return output
    },
    validate: (): void => {
      if (options.watermark) watermarkPageNumbers(options.watermark, physicalPageOffset)
    },
  }
}
