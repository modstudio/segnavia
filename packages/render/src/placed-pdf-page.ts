import { displayedPdfPage, type PageBoxName, placedPdfPage, resolveLimits } from '@segnavia/format'
import { PLACED_PDF_SOURCES, type PlacedPdfSource, type PlacementsOptions } from '@segnavia/html'
import { endMarkedContent, PDFDict, PDFName, PDFNumber, PDFOperator, type PDFPage } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import type { RenderOptions } from './options.ts'
import { drawClippedPage } from './pdf-compose.ts'
import { loadPdf } from './pdf-load.ts'

export interface PlacedPdfMeasurement {
  address: string
  page: number
  box?: PageBoxName
  paper: number
  draw: { x: number; y: number; width: number; height: number }
  clip: { x: number; y: number; width: number; height: number }
}

/** Measures PDF marker images in CSS pixels relative to their output paper. */
export async function measurePlacedPdfPages(tab: Tab): Promise<PlacedPdfMeasurement[]> {
  return tab.evaluate(() => {
    const intersect = (a: DOMRect, b: DOMRect) => {
      const left = Math.max(a.left, b.left)
      const top = Math.max(a.top, b.top)
      const right = Math.min(a.right, b.right)
      const bottom = Math.min(a.bottom, b.bottom)
      return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
    }
    const papers = [...document.querySelectorAll<HTMLElement>('[data-segnavia-printed-page]')]
    return [...document.querySelectorAll<HTMLElement>('[data-segnavia-placed-pdf]')].flatMap((element) => {
      const address = element.getAttribute('data-segnavia-media')
      const page = Number(element.getAttribute('data-segnavia-placed-pdf'))
      const box = element.getAttribute('data-segnavia-box') as PageBoxName | null
      if (!address || !Number.isSafeInteger(page) || page < 1) return []
      const paperElement = element.closest<HTMLElement>('[data-segnavia-printed-page]')
      const paper = paperElement ? papers.indexOf(paperElement) : 0
      const paperBox = paperElement?.getBoundingClientRect() ?? document.documentElement.getBoundingClientRect()
      const draw = element.getBoundingClientRect()
      let visible = draw
      for (let parent = element.parentElement; parent && parent !== paperElement; parent = parent.parentElement) {
        const style = getComputedStyle(parent)
        if ([style.overflow, style.overflowX, style.overflowY].some((value) => value === 'hidden' || value === 'clip')) {
          visible = intersect(visible, parent.getBoundingClientRect())
        }
      }
      const relative = (box: DOMRect) => ({
        x: box.left - paperBox.left,
        y: paperBox.bottom - box.bottom,
        width: box.width,
        height: box.height,
      })
      return [{ address, page, ...(box ? { box } : {}), paper: Math.max(0, paper), draw: relative(draw), clip: relative(visible) }]
    })
  })
}

const pixelPoints = (value: number) => (value * 72) / 96
const rectanglePoints = (box: PlacedPdfMeasurement['draw']) => ({
  x: pixelPoints(box.x),
  y: pixelPoints(box.y),
  width: pixelPoints(box.width),
  height: pixelPoints(box.height),
})

function sources(options: Pick<RenderOptions, 'placements'>): Map<string, PlacedPdfSource> | undefined {
  return (options.placements as PlacementsOptions | undefined)?.[PLACED_PDF_SOURCES]
}

function transparencyGroup(page: PDFPage, ref: Parameters<typeof page.doc.context.lookup>[0]): void {
  const form = page.doc.context.lookup(ref, PDFDict)
  form.set(PDFName.of('Group'), page.doc.context.obj({ S: 'Transparency', I: true, K: false }))
}

/** Replaces measured transparent markers with clipped PDF Form XObjects. */
export async function drawPlacedPdfPages(
  pdf: Uint8Array,
  measurements: readonly PlacedPdfMeasurement[],
  options: Pick<RenderOptions, 'placements' | 'limits'>,
): Promise<Uint8Array> {
  const registered = sources(options)
  if (!registered || measurements.length === 0) return pdf
  const output = await loadPdf(pdf)
  const loaded = new Map<string, Awaited<ReturnType<typeof loadPdf>>>()
  const embedded = new Map<string, Awaited<ReturnType<typeof output.embedPage>>>()
  const limits = resolveLimits(undefined, options.limits)
  for (const placement of measurements) {
    const source = registered.get(placement.address)
    const target = output.getPage(placement.paper)
    if (!source || !target) continue
    let document = loaded.get(placement.address)
    if (!document) {
      document = await loadPdf(source.bytes, { source: 'received', limits })
      loaded.set(placement.address, document)
    }
    const selected = placedPdfPage(source.media, placement.page, placement.box)
    if (selected === 'no-page') continue
    const sourcePage = document.getPage(selected.page - 1)
    if (!sourcePage) continue
    const userUnit = sourcePage.node.lookup(PDFName.of('UserUnit'), PDFNumber)?.asNumber() ?? 1
    const display = displayedPdfPage(selected.bounds, sourcePage.getRotation().angle, userUnit)
    const key = `${placement.address}\0${selected.page}\0${selected.box}`
    let form = embedded.get(key)
    if (!form) {
      form = await output.embedPage(
        sourcePage,
        {
          left: selected.bounds.x,
          bottom: selected.bounds.y,
          right: selected.bounds.x + selected.bounds.width,
          top: selected.bounds.y + selected.bounds.height,
        },
        [...display.matrix],
      )
      embedded.set(key, form)
      transparencyGroup(target, form.ref)
    }
    target.pushOperators(PDFOperator.of('BDC' as never, [PDFName.of('Artifact')]))
    drawClippedPage(target, form, rectanglePoints(placement.draw), rectanglePoints(placement.clip))
    target.pushOperators(endMarkedContent())
  }
  return output.save()
}
