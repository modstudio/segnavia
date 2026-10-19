import { type Print, PX_PER_MM, printBoxes, printPadding, printProperties, sheetMm } from '@segnavia/format'
import { PDFName, rgb } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import { type PrintResult, printWithOverflow } from './overflow.ts'
import { type PdfRectangle, pdfBox, pdfPoint, pt } from './pdf-geometry.ts'
import { loadPdf } from './pdf-load.ts'

const usesPressLayout = (print: Print) => print.bleed > 0 || print.marks

export function printCss(print: Print): string {
  const properties = printProperties(print)
  if (!usesPressLayout(print)) return properties
  const margin = print.margin ?? { top: 0, right: 0, bottom: 0, left: 0 }
  return `${properties}${printPadding({
    top: margin.top + print.bleed,
    right: margin.right + print.bleed,
    bottom: margin.bottom + print.bleed,
    left: margin.left + print.bleed,
  })}`
}

export function printViewport(print: Print, pressLayout: boolean): { width: number; height: number } {
  const size = pressLayout && usesPressLayout(print) ? printBoxes(print).bleedBox : sheetMm(print)
  return { width: Math.round(size.width * PX_PER_MM), height: Math.round(size.height * PX_PER_MM) }
}

export function assertPrintOptions(print: Print, preferCssPageSize: boolean | undefined): void {
  if (usesPressLayout(print) && preferCssPageSize) {
    throw new RenderRefusedError(
      'A page with bleed or marks takes its size from its print setting. Remove preferCssPageSize, or remove the bleed and marks, to clear this refusal.',
    )
  }
}

async function addPressBoxes(pdf: Uint8Array, print: Print): Promise<Uint8Array> {
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
  for (const mark of boxes.marks) {
    page.drawLine({
      start: pdfPoint(mark.x1, mark.y1, boxes.media.height),
      end: pdfPoint(mark.x2, mark.y2, boxes.media.height),
      thickness: 0.25,
      color: rgb(0, 0, 0),
    })
  }
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
    const pageWidth = Math.round(mm.width * PX_PER_MM)
    return printWithOverflow(
      tab,
      pageWidth,
      'page',
      {
        width: `${mm.width}mm`,
        height: `${mm.height}mm`,
        printBackground: true,
        preferCSSPageSize: preferCssPageSize ?? false,
        margin: margin ? { top: `${margin.top}mm`, right: `${margin.right}mm`, bottom: `${margin.bottom}mm`, left: `${margin.left}mm` } : undefined,
      },
      inputIndex,
    )
  }

  const boxes = printBoxes(print)
  const printed = await printWithOverflow(
    tab,
    Math.round(boxes.bleedBox.width * PX_PER_MM),
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
