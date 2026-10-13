import { MM_PER_PT, type Print, PX_PER_MM, printBoxes, printProperties, sheetMm } from '@segnavia/format'
import { PDFDocument, PDFName, rgb } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'

const usesPressLayout = (print: Print) => print.bleed > 0 || print.marks
const pt = (mm: number) => mm / MM_PER_PT

export function printCss(print: Print): string {
  const properties = printProperties(print)
  if (!usesPressLayout(print)) return properties
  const margin = print.margin ?? { top: 0, right: 0, bottom: 0, left: 0 }
  // Padding uses physical sides because the edges of paper do not change with text direction.
  const padding = [margin.top, margin.right, margin.bottom, margin.left].map((value) => `${value + print.bleed}mm`).join(' ')
  return `${properties}:where(html){padding:${padding}}`
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

function pdfPoint(x: number, y: number, mediaHeight: number): { x: number; y: number } {
  return { x: pt(x), y: pt(mediaHeight - y) }
}

async function addPressBoxes(pdf: Uint8Array, print: Print): Promise<Uint8Array> {
  const boxes = printBoxes(print)
  const document = await PDFDocument.load(pdf)
  const source = document.getPage(0)
  const content = await document.embedPage(source)
  const page = document.addPage([pt(boxes.media.width), pt(boxes.media.height)])
  page.drawPage(content, {
    x: pt(boxes.bleedBox.x),
    y: pt(boxes.media.height - boxes.bleedBox.y - boxes.bleedBox.height),
    width: source.getWidth(),
    height: source.getHeight(),
  })
  document.removePage(0)
  page.node.delete(PDFName.of('CropBox'))
  const bleedBottomLeft = pdfPoint(boxes.bleedBox.x, boxes.bleedBox.y + boxes.bleedBox.height, boxes.media.height)
  const trimBottomLeft = pdfPoint(boxes.trim.x, boxes.trim.y + boxes.trim.height, boxes.media.height)
  page.setBleedBox(bleedBottomLeft.x, bleedBottomLeft.y, pt(boxes.bleedBox.width), pt(boxes.bleedBox.height))
  page.setTrimBox(trimBottomLeft.x, trimBottomLeft.y, pt(boxes.trim.width), pt(boxes.trim.height))
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

export async function printPage(tab: Tab, print: Print, preferCssPageSize: boolean | undefined): Promise<Uint8Array> {
  if (!usesPressLayout(print)) {
    const mm = sheetMm(print)
    const margin = print.margin
    return tab.pdf({
      width: `${mm.width}mm`,
      height: `${mm.height}mm`,
      printBackground: true,
      preferCSSPageSize: preferCssPageSize ?? false,
      margin: margin ? { top: `${margin.top}mm`, right: `${margin.right}mm`, bottom: `${margin.bottom}mm`, left: `${margin.left}mm` } : undefined,
    })
  }

  const boxes = printBoxes(print)
  const pdf = await tab.pdf({
    width: `${boxes.bleedBox.width}mm`,
    height: `${boxes.bleedBox.height}mm`,
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  })
  const papers = (await PDFDocument.load(pdf)).getPageCount()
  if (papers > 1) {
    throw new RenderRefusedError(
      `A page with bleed or marks is one printed piece, but the content needs ${papers} papers. Shorten the content, or remove the bleed and marks.`,
    )
  }
  return addPressBoxes(pdf, print)
}
