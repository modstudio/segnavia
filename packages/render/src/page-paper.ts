import { type Print, paperPixels, printBoxes, printProperties, sheetMm } from '@segnavia/format'
import { PDFName } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import { type PrintResult, printWithOverflow } from './overflow.ts'
import { type PdfRectangle, pdfBox, pdfPoint, pt } from './pdf-geometry.ts'
import { loadPdf } from './pdf-load.ts'
import { drawCropMarks } from './pdf-marks.ts'
import { pagePdfSize, setPdfPageSize } from './pdf-page-size.ts'

const usesPressLayout = (print: Print) => print.bleed > 0 || print.marks

export function printCss(print: Print): string {
  const properties = printProperties(print)
  if (!usesPressLayout(print)) return properties
  const { bleedBox } = printBoxes(print)
  const margin = print.margin ?? { top: 0, right: 0, bottom: 0, left: 0 }
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
    .join(' ')}!important;width:auto!important;height:auto!important}`
  return `${properties}${root}${body}`
}

export function printViewport(print: Print): { width: number; height: number } {
  const size = usesPressLayout(print) ? printBoxes(print).bleedBox : sheetMm(print)
  return { width: paperPixels(size.width), height: paperPixels(size.height) }
}

export function assertPrintOptions(print: Print, preferCssPageSize: boolean | undefined): void {
  if (usesPressLayout(print) && preferCssPageSize) {
    throw new RenderRefusedError(
      'A page with bleed or marks takes its size from its print setting. Remove preferCssPageSize, or remove the bleed and marks, to clear this refusal.',
    )
  }
}

export async function addPressBoxes(pdf: Uint8Array, print: Print): Promise<Uint8Array> {
  const boxes = printBoxes(print)
  const document = await loadPdf(pdf)
  const source = document.getPage(0)
  const content = await document.embedPage(source)
  const page = document.addPage([pt(boxes.media.width), pt(boxes.media.height)])
  const bleedBox = pdfBox(boxes.bleedBox, boxes.media.height)
  const trimBox = pdfBox(boxes.trim, boxes.media.height)
  page.drawPage(content, pressContentPlacement({ width: source.getWidth(), height: source.getHeight() }, bleedBox))
  document.removePage(0)
  page.node.delete(PDFName.of('CropBox'))
  page.setBleedBox(bleedBox.x, bleedBox.y, bleedBox.width, bleedBox.height)
  page.setTrimBox(trimBox.x, trimBox.y, trimBox.width, trimBox.height)
  drawCropMarks(
    page,
    boxes.marks.map((mark) => ({
      start: pdfPoint(mark.x1, mark.y1, boxes.media.height),
      end: pdfPoint(mark.x2, mark.y2, boxes.media.height),
    })),
    print.markColor,
  )
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

export async function printPage(tab: Tab, print: Print, preferCssPageSize: boolean | undefined, inputIndex?: number): Promise<PrintResult<true>> {
  if (!usesPressLayout(print)) {
    const mm = sheetMm(print)
    const margin = print.margin
    const pageWidth = paperPixels(mm.width)
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
    paperPixels(boxes.bleedBox.width),
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
  const papers = (await loadPdf(printed.bytes)).getPageCount()
  if (papers > 1) {
    throw new RenderRefusedError(
      `A page with bleed or marks is one printed piece, but the content needs ${papers} papers. Shorten the content, or remove the bleed and marks.`,
    )
  }
  return { bytes: await addPressBoxes(printed.bytes, print), overflow: printed.overflow }
}
