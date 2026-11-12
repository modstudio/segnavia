import { PDFArray, PDFName, PDFNumber, PDFOperator, endMarkedContent } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import { createPdf, loadPdf } from './pdf-load.ts'
import type { WatermarkPage } from './watermark-markup.ts'

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
    if (!embedded) throw new RenderRefusedError(`The watermark layer page for physical page ${pageNumber} could not be embedded; rebuild it to clear this refusal.`)
    const bbox = output.context.obj([
      PDFNumber.of(trim.x),
      PDFNumber.of(trim.y),
      PDFNumber.of(trim.x + trim.width),
      PDFNumber.of(trim.y + trim.height),
    ]) as PDFArray
    const properties = output.context.obj({ Type: 'Pagination', Subtype: 'Watermark', BBox: bbox })
    page.pushOperators(PDFOperator.of('BDC', [PDFName.of('Artifact'), properties as never]))
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
