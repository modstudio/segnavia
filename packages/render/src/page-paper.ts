import {
  type MarkColor,
  type Print,
  type PrintBoxes,
  paperViewport,
  physicalMargins,
  printBoxes,
  printProperties,
  sheetMm,
  type TextDirection,
  usesPressLayout,
} from '@segnavia/format'
import { PDFName } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { translateNamedDestinations } from './book-destinations.ts'
import { RenderOversetError, RenderRefusedError } from './errors.ts'
import { type PrintResult, printWithOverflow } from './overflow.ts'
import { type PdfRectangle, pdfBox, pdfPoint, pt } from './pdf-geometry.ts'
import { loadPdf } from './pdf-load.ts'
import { drawCropMarks } from './pdf-marks.ts'
import { pagePdfSize, setPdfPageSize, translatePdfAnnotations } from './pdf-page-size.ts'

export function printCss(print: Print, direction: TextDirection): string {
  const properties = printProperties(print)
  if (!usesPressLayout(print)) return properties
  const { bleedBox } = printBoxes(print)
  const margin = physicalMargins(print.margin ?? { blockStart: 0, blockEnd: 0, inlineStart: 0, inlineEnd: 0 }, direction, 'recto')
  const edges = {
    top: margin.top + print.bleed,
    right: margin.right + print.bleed,
    bottom: margin.bottom + print.bleed,
    left: margin.left + print.bleed,
  }
  const padding = [edges.top, edges.right, edges.bottom, edges.left].map((value) => `${value}mm`).join(' ')
  const root = `:where(html){box-sizing:border-box!important;position:relative!important;width:${bleedBox.width}mm!important;height:${bleedBox.height}mm!important;overflow:clip!important;padding:${padding}}`
  // The body follows the root's exact content box even when author print CSS
  // would otherwise position it against Chromium's rounded viewport.
  const body = `:where(body){position:absolute!important;inset:${[edges.top, edges.right, edges.bottom, edges.left]
    .map((value) => `${value}mm`)
    .join(' ')}!important;width:auto!important;height:auto!important;margin:0!important}`
  return `${properties}${root}${body}`
}

export function assertPrintOptions(print: Print, preferCssPageSize: boolean | undefined): void {
  if (usesPressLayout(print) && preferCssPageSize) {
    throw new RenderRefusedError(
      'A page with bleed or marks takes its size from its print setting. Remove preferCssPageSize, or remove the bleed and marks, to clear this refusal.',
    )
  }
}

export async function addPressBoxes(
  pdf: Uint8Array,
  boxes: PrintBoxes,
  markColor: MarkColor = 'black',
  sourceBox: 'bleed' | 'trim' = 'bleed',
): Promise<Uint8Array> {
  const document = await loadPdf(pdf)
  return addDocumentPressBoxes(
    document,
    document.getPages().map(() => boxes),
    markColor,
    sourceBox,
  )
}

async function addDocumentPressBoxes(
  document: Awaited<ReturnType<typeof loadPdf>>,
  boxesByPage: readonly PrintBoxes[],
  markColor: MarkColor,
  sourceBox: 'bleed' | 'trim',
): Promise<Uint8Array> {
  const sources = document.getPages()
  if (sources.length !== boxesByPage.length) {
    throw new RenderRefusedError(
      `The PDF has ${sources.length} pages where the press plan names ${boxesByPage.length}; compute a new plan to clear this refusal.`,
    )
  }
  for (const [index, source] of sources.entries()) {
    const boxes = boxesByPage[index]
    if (!boxes) throw new RenderRefusedError(`The press plan has no geometry for page ${index + 1}; compute a new plan to clear this refusal.`)
    const bleedBox = pdfBox(boxes.bleedBox, boxes.media.height)
    const trimBox = pdfBox(boxes.trim, boxes.media.height)
    const content = await document.embedPage(source)
    const page = document.addPage([pt(boxes.media.width), pt(boxes.media.height)])
    const target = sourceBox === 'trim' ? trimBox : bleedBox
    page.drawPage(content, pressContentPlacement({ width: source.getWidth(), height: source.getHeight() }, target))
    page.node.delete(PDFName.of('CropBox'))
    page.setBleedBox(bleedBox.x, bleedBox.y, bleedBox.width, bleedBox.height)
    page.setTrimBox(trimBox.x, trimBox.y, trimBox.width, trimBox.height)
    drawCropMarks(
      page,
      boxes.marks.map((mark) => ({
        start: pdfPoint(mark.x1, mark.y1, boxes.media.height),
        end: pdfPoint(mark.x2, mark.y2, boxes.media.height),
      })),
      markColor,
    )
  }
  for (let index = 0; index < sources.length; index++) document.removePage(0)
  return document.save()
}

export async function addPressBoxesByPage(
  pdf: Uint8Array,
  boxesByPage: readonly PrintBoxes[],
  markColor: MarkColor = 'black',
  sourceBox: 'bleed' | 'trim' = 'bleed',
): Promise<Uint8Array> {
  const document = await loadPdf(pdf)
  const pages = document.getPages()
  if (pages.length !== boxesByPage.length) {
    throw new RenderRefusedError(
      `The PDF has ${pages.length} pages where the press plan names ${boxesByPage.length}; compute a new plan to clear this refusal.`,
    )
  }
  const translations = new Map<string, { x: number; y: number }>()
  for (const [index, page] of pages.entries()) {
    const boxes = boxesByPage[index]
    if (!boxes) throw new RenderRefusedError(`The press plan has no geometry for page ${index + 1}; compute a new plan to clear this refusal.`)
    const target = sourceBox === 'trim' ? pdfBox(boxes.trim, boxes.media.height) : pdfBox(boxes.bleedBox, boxes.media.height)
    const translation = { x: target.x, y: target.y }
    page.translateContent(translation.x, translation.y)
    translatePdfAnnotations(page.node.Annots(), translation.x, translation.y)
    translations.set(page.ref.toString(), translation)
    page.setMediaBox(0, 0, pt(boxes.media.width), pt(boxes.media.height))
    page.node.delete(PDFName.of('CropBox'))
    const bleedBox = pdfBox(boxes.bleedBox, boxes.media.height)
    const trimBox = pdfBox(boxes.trim, boxes.media.height)
    page.setBleedBox(bleedBox.x, bleedBox.y, bleedBox.width, bleedBox.height)
    page.setTrimBox(trimBox.x, trimBox.y, trimBox.width, trimBox.height)
    drawCropMarks(
      page,
      boxes.marks.map((mark) => ({
        start: pdfPoint(mark.x1, mark.y1, boxes.media.height),
        end: pdfPoint(mark.x2, mark.y2, boxes.media.height),
      })),
      markColor,
    )
  }
  translateNamedDestinations(document, translations)
  return document.save()
}

export function pressContentPlacement(source: { width: number; height: number }, bleedBox: PdfRectangle): PdfRectangle {
  return {
    x: bleedBox.x,
    y: bleedBox.y + bleedBox.height - source.height,
    width: source.width,
    height: source.height,
  }
}

export function oversetRefusal(page: number, papers: number): RenderOversetError | undefined {
  return papers > 1 ? new RenderOversetError(page, papers) : undefined
}

export async function printPage(
  tab: Tab,
  print: Print,
  preferCssPageSize: boolean | undefined,
  inputIndex: number | undefined,
  direction: TextDirection,
): Promise<PrintResult<true>> {
  const pageWidth = paperViewport(print).width
  if (!usesPressLayout(print)) {
    const mm = sheetMm(print)
    const margin = print.margin ? physicalMargins(print.margin, direction, 'recto') : undefined
    const printed = await printWithOverflow(
      tab,
      pageWidth,
      'page',
      {
        ...pagePdfSize(mm, margin),
        printBackground: true,
        preferCSSPageSize: preferCssPageSize ?? false,
      },
      inputIndex,
    )
    return preferCssPageSize ? printed : { ...printed, bytes: await setPdfPageSize(printed.bytes, mm) }
  }

  const boxes = printBoxes(print)
  const printed = await printWithOverflow(
    tab,
    pageWidth,
    'page',
    {
      width: `${boxes.bleedBox.width}mm`,
      height: `${boxes.bleedBox.height}mm`,
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    },
    inputIndex,
  )
  const bytes = await setPdfPageSize(
    printed.bytes,
    boxes.bleedBox,
    'A page with bleed or marks prints at its bleed box, so the content or a CSS rule changed the paper Chromium produced; remove an @page size rule or the rule that resizes the page to clear this refusal.',
  )
  const papers = (await loadPdf(bytes)).getPageCount()
  const overset = oversetRefusal(inputIndex ?? 0, papers)
  if (overset) throw overset
  return { bytes: await addPressBoxes(bytes, boxes, print.markColor), overflow: printed.overflow }
}
