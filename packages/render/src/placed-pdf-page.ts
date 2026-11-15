import { cssPixelsToPoints, displayedPdfPage, type PageBoxName, placedPdfPage, resolveLimits } from '@segnavia/format'
import { PLACED_PDF_SOURCES, type PlacedPdfSource, type PlacementsOptions } from '@segnavia/html'
import { endMarkedContent, PDFName, PDFOperator, type PDFPage, PDFRawStream } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import type { RenderOptions } from './options.ts'
import { drawClippedPage } from './pdf-compose.ts'
import { loadPdf } from './pdf-load.ts'
import { MARKER_LINK_PREFIX, markerMeasurements } from './placed-pdf-markers.ts'
import { sourcePdfPageFacts } from './placed-pdf-source.ts'

export interface PlacedPdfMeasurement {
  id?: string
  anchorOffset?: { x: number; y: number }
  address: string
  page: number
  box?: PageBoxName
  crop?: string
  paper: number
  draw: { x: number; y: number; width: number; height: number }
  clip: { x: number; y: number; width: number; height: number }
}

/** Gives Chromium a link rectangle it can place in the fragmented PDF output. */
export async function preparePlacedPdfPages(tab: Tab): Promise<void> {
  await tab.evaluate((prefix) => {
    const markers = [...document.querySelectorAll<HTMLElement>('[data-segnavia-placed-pdf]')].filter(
      (element) => !element.closest('[data-segnavia-galley-source]'),
    )
    for (const [index, element] of markers.entries()) {
      if (element.hasAttribute('data-segnavia-placed-pdf-id')) continue
      const id = String(index)
      element.setAttribute('data-segnavia-placed-pdf-id', id)
      const marker = element.getBoundingClientRect()
      const link = document.createElement('a')
      link.href = `${prefix}${id}`
      element.replaceWith(link)
      link.append(element)
      const anchor = link.getBoundingClientRect()
      element.setAttribute('data-segnavia-placed-pdf-offset-x', String(marker.left - anchor.left))
      element.setAttribute('data-segnavia-placed-pdf-offset-y', String(anchor.bottom - marker.bottom))
    }
  }, MARKER_LINK_PREFIX)
}

/** Measures PDF marker images in CSS pixels relative to their output paper. */
export async function measurePlacedPdfPages(tab: Tab, scale = 1): Promise<PlacedPdfMeasurement[]> {
  await tab.emulateMedia({ media: 'print' })
  const measured = await tab.evaluate(() => {
    const intersect = (a: DOMRect, b: DOMRect) => {
      const left = Math.max(a.left, b.left)
      const top = Math.max(a.top, b.top)
      const right = Math.min(a.right, b.right)
      const bottom = Math.min(a.bottom, b.bottom)
      return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
    }
    const visibleBox = (element: HTMLElement, paper: HTMLElement | null, draw: DOMRect) => {
      let visible = draw
      for (let parent = element.parentElement; parent && parent !== paper; parent = parent.parentElement) {
        const style = getComputedStyle(parent)
        if ([style.overflow, style.overflowX, style.overflowY].some((value) => value === 'hidden' || value === 'clip')) {
          visible = intersect(visible, parent.getBoundingClientRect())
        }
      }
      return visible
    }
    const papers = [...document.querySelectorAll<HTMLElement>('[data-segnavia-printed-page]')]
    const markerData = (element: HTMLElement) => {
      const address = element.getAttribute('data-segnavia-media')
      const page = Number(element.getAttribute('data-segnavia-placed-pdf'))
      const box = element.getAttribute('data-segnavia-box') as PageBoxName | null
      const crop = element.getAttribute('data-segnavia-crop')
      const id = element.getAttribute('data-segnavia-placed-pdf-id')
      const offsetX = Number(element.getAttribute('data-segnavia-placed-pdf-offset-x'))
      const offsetY = Number(element.getAttribute('data-segnavia-placed-pdf-offset-y'))
      if (!address || !Number.isSafeInteger(page) || page < 1) return undefined
      return {
        address,
        ...(id ? { id } : {}),
        ...(Number.isFinite(offsetX) && Number.isFinite(offsetY) ? { anchorOffset: { x: offsetX, y: offsetY } } : {}),
        page,
        ...(box ? { box } : {}),
        ...(crop ? { crop } : {}),
      }
    }
    const measure = (element: HTMLElement) => {
      if (element.closest('[data-segnavia-galley-source]')) return undefined
      const data = markerData(element)
      if (!data) return undefined
      const paperElement = element.closest<HTMLElement>('[data-segnavia-printed-page]')
      const paper = paperElement ? papers.indexOf(paperElement) : 0
      const paperBox = paperElement?.getBoundingClientRect() ?? document.documentElement.getBoundingClientRect()
      const draw = element.getBoundingClientRect()
      const visible = visibleBox(element, paperElement, draw)
      const relative = (box: DOMRect) => ({
        x: box.left - paperBox.left,
        y: paperBox.bottom - box.bottom,
        width: box.width,
        height: box.height,
      })
      return {
        ...data,
        paper: Math.max(0, paper),
        draw: relative(draw),
        clip: relative(visible),
      }
    }
    return [...document.querySelectorAll<HTMLElement>('[data-segnavia-placed-pdf]')].map(measure).filter((placement) => placement !== undefined)
  })
  if (scale === 1) return measured
  const scaled = (box: PlacedPdfMeasurement['draw']) => ({
    x: box.x * scale,
    y: box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  })
  return measured.map((placement) => ({
    ...placement,
    draw: scaled(placement.draw),
    clip: scaled(placement.clip),
    ...(placement.anchorOffset ? { anchorOffset: { x: placement.anchorOffset.x * scale, y: placement.anchorOffset.y * scale } } : {}),
  }))
}

function positionedMeasurement(
  placement: PlacedPdfMeasurement,
  measured: Pick<PlacedPdfMeasurement, 'paper' | 'draw' | 'clip'> | undefined,
): PlacedPdfMeasurement {
  if (!measured) return placement
  const x = measured.draw.x + (placement.anchorOffset?.x ?? 0)
  const y = measured.draw.y + (placement.anchorOffset?.y ?? 0)
  return {
    ...placement,
    paper: measured.paper,
    draw: { x, y, width: placement.draw.width, height: placement.draw.height },
    clip: {
      x: x + placement.clip.x - placement.draw.x,
      y: y + placement.clip.y - placement.draw.y,
      width: placement.clip.width,
      height: placement.clip.height,
    },
  }
}

const rectanglePoints = (box: PlacedPdfMeasurement['draw']) => ({
  x: cssPixelsToPoints(box.x),
  y: cssPixelsToPoints(box.y),
  width: cssPixelsToPoints(box.width),
  height: cssPixelsToPoints(box.height),
})

function sources(options: Pick<RenderOptions, 'placements'>): Map<string, PlacedPdfSource> | undefined {
  return (options.placements as PlacementsOptions | undefined)?.[PLACED_PDF_SOURCES]
}

export function hasPlacedPdfPages(options: Pick<RenderOptions, 'placements'>): boolean {
  return (sources(options)?.size ?? 0) > 0
}

function transparencyGroup(page: PDFPage, ref: Parameters<typeof page.doc.context.lookup>[0]): void {
  const form = page.doc.context.lookup(ref)
  if (!(form instanceof PDFRawStream)) throw new Error('An embedded PDF page did not produce a Form XObject stream.')
  form.dict.set(PDFName.of('Group'), page.doc.context.obj({ S: 'Transparency', I: true, K: false }))
}

function cropEdge(value: string, extent: number): number {
  if (value.endsWith('%')) return (Number(value.slice(0, -1)) / 100) * extent
  return cssPixelsToPoints(Number(value.replace(/px$/, '')))
}

export function placedPdfCrop(
  bounds: { x: number; y: number; width: number; height: number },
  crop: string | undefined,
  address: string,
): { x: number; y: number; width: number; height: number } {
  if (!crop) return bounds
  const values = crop.trim().split(/\s+/)
  const [top, right = top, bottom = top, left = right] = values
  if (!top || !right || !bottom || !left) return bounds
  const edges = {
    top: cropEdge(top, bounds.height),
    right: cropEdge(right, bounds.width),
    bottom: cropEdge(bottom, bounds.height),
    left: cropEdge(left, bounds.width),
  }
  if (Object.values(edges).some((edge) => !Number.isFinite(edge))) return bounds
  const cropped = {
    x: bounds.x + edges.left,
    y: bounds.y + edges.bottom,
    width: bounds.width - edges.left - edges.right,
    height: bounds.height - edges.top - edges.bottom,
  }
  if (cropped.width <= 0 || cropped.height <= 0) {
    throw new RenderRefusedError(`Cannot place PDF at ${address}; its crop leaves no area of the page. Use a smaller crop to clear this refusal.`)
  }
  return cropped
}

function uncroppedDraw(
  draw: PlacedPdfMeasurement['draw'],
  bounds: { x: number; y: number; width: number; height: number },
  crop: { x: number; y: number; width: number; height: number },
): PlacedPdfMeasurement['draw'] {
  const scaleX = draw.width / crop.width
  const scaleY = draw.height / crop.height
  return {
    x: draw.x - (crop.x - bounds.x) * scaleX,
    y: draw.y - (crop.y - bounds.y) * scaleY,
    width: bounds.width * scaleX,
    height: bounds.height * scaleY,
  }
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
  const markers = markerMeasurements(output, measurements)
  const loaded = new Map<string, Awaited<ReturnType<typeof loadPdf>>>()
  const embedded = new Map<string, Awaited<ReturnType<typeof output.embedPage>>>()
  const limits = resolveLimits(undefined, options.limits)
  for (const placement of measurements) {
    const positioned = positionedMeasurement(placement, placement.id ? markers.get(placement.id) : undefined)
    const source = registered.get(placement.address)
    const target = output.getPage(positioned.paper)
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
    const crop = placedPdfCrop(selected.bounds, positioned.crop, placement.address)
    const { rotate, userUnit } = sourcePdfPageFacts(sourcePage)
    const display = displayedPdfPage(selected.sourceBounds, rotate, userUnit)
    if (!sourcePage.node.get(PDFName.of('Contents'))) continue
    const key = `${placement.address}\0${selected.page}\0${selected.box}`
    let form = embedded.get(key)
    if (!form) {
      form = await output.embedPage(
        sourcePage,
        {
          left: selected.sourceBounds.x,
          bottom: selected.sourceBounds.y,
          right: selected.sourceBounds.x + selected.sourceBounds.width,
          top: selected.sourceBounds.y + selected.sourceBounds.height,
        },
        [...display.matrix],
      )
      await form.embed()
      embedded.set(key, form)
      transparencyGroup(target, form.ref)
    }
    target.pushOperators(PDFOperator.of('BMC' as never, [PDFName.of('Artifact')]))
    const draw = rectanglePoints(uncroppedDraw(positioned.draw, selected.bounds, crop))
    drawClippedPage(
      target,
      form,
      { ...draw, width: (draw.width * form.width) / display.width, height: (draw.height * form.height) / display.height },
      rectanglePoints(positioned.clip),
    )
    target.pushOperators(endMarkedContent())
  }
  return output.save()
}
