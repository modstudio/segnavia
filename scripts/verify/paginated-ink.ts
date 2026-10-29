import type { Frame } from 'playwright-core'
import type { Harness } from './harness.ts'
import { INK_BAND_PX, INK_NEIGHBORHOOD_PX, INK_PIXEL_TOLERANCE, type InkImage, inkBounds, presenceDiff, stackImages } from './paginated-ink-pixels.ts'
import {
  columnGroupKey,
  galleyInlineOffset,
  groupedWindowIndexes,
  intersectsScaledExtent,
  type OffsetRange,
  type SequentialWindow,
  sequentialPairs,
} from './paginated-ink-windows.ts'

interface InkWindow extends SequentialWindow {
  top: number
  windowIndex: number
  localX: number
  width: number
  height: number
  blocks: number[]
  scaledExtents: OffsetRange[]
}

type CollectedInkWindow = Omit<InkWindow, 'localX'> & { flowLeft: number; runLeft?: number }

interface Mismatch {
  flow: string
  column: number
  side?: 'start' | 'end' | 'break'
  offset: number
  over: number
  lost: number
  extra: number
  galleyInk?: number
  pageInk?: number
  galleySize?: number[]
  pageSize?: number[]
}

async function pngRgba(h: Harness, png: Buffer): Promise<InkImage> {
  return h.page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return { width: 0, height: 0, data: [] as number[] }
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    return { width: img.width, height: img.height, data: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data) }
  }, png.toString('base64'))
}

async function screenshotBand(h: Harness, frame: Frame, selector: string, localX: number, localY: number, width: number, height: number) {
  const handle = await frame.$(selector)
  if (!handle) throw new Error(`The paginated book has no ${selector}.`)
  await handle.evaluate((element, y) => {
    const box = element.getBoundingClientRect()
    const root = document.scrollingElement
    if (!root) return
    root.scrollTop += box.top + y - innerHeight / 2
  }, localY)
  const local = await handle.evaluate(
    (element, arg) => {
      const box = element.getBoundingClientRect()
      return { x: box.left + arg.x, y: box.top + arg.y, maxX: box.left + box.width, maxY: box.top + box.height }
    },
    { x: localX, y: localY },
  )
  const frameEl = await frame.frameElement()
  const iframeBox = await frameEl.boundingBox()
  if (!iframeBox) throw new Error(`The paginated book frame has no box for ${selector}.`)
  const x = iframeBox.x + local.x
  const y = iframeBox.y + local.y
  const maxX = Math.min(iframeBox.x + iframeBox.width, iframeBox.x + local.maxX)
  const maxY = Math.min(iframeBox.y + iframeBox.height, iframeBox.y + local.maxY)
  const clipX = Math.max(iframeBox.x, x)
  const clipY = Math.max(iframeBox.y, y)
  return h.page.screenshot({
    clip: {
      x: Math.floor(clipX),
      y: Math.floor(clipY),
      width: Math.max(1, Math.round(Math.min(width, maxX - clipX))),
      height: Math.max(1, Math.round(Math.min(height, maxY - clipY))),
    },
    animations: 'disabled',
  })
}

async function collectWindows(frame: Frame): Promise<InkWindow[]> {
  const windows = await frame.evaluate(() => {
    const replacedExtent = (node: Element, flowTop: number): OffsetRange | undefined => {
      const replaced = node as Element & { naturalHeight?: number; naturalWidth?: number }
      const naturalHeight = replaced.naturalHeight
      const naturalWidth = replaced.naturalWidth
      if (typeof naturalHeight !== 'number' || typeof naturalWidth !== 'number' || naturalHeight <= 0 || naturalWidth <= 0) return
      const box = node.getBoundingClientRect()
      if (box.height >= naturalHeight - 0.5 && box.width >= naturalWidth - 0.5) return
      return { start: box.top - flowTop, end: box.bottom - flowTop }
    }
    const scaledExtentsFor = (children: Element[], flowTop: number): OffsetRange[] => {
      const extents: OffsetRange[] = []
      for (const child of children) {
        for (const node of [child, ...Array.from(child.querySelectorAll('*'))]) {
          const extent = replacedExtent(node, flowTop)
          if (extent) extents.push(extent)
        }
      }
      return extents
    }
    const windows: CollectedInkWindow[] = []
    const views = Array.from(document.querySelectorAll('[data-segnavia-window]'))
    for (const [windowIndex, view] of views.entries()) {
      const flowId = view.getAttribute('data-flow') ?? ''
      const flow = document.querySelector(`[data-segnavia-galley-source] [data-segnavia-flow="${flowId}"]`)
      if (!flow) continue
      const flowBox = flow.getBoundingClientRect()
      const viewBox = view.getBoundingClientRect()
      const columns = Number(view.getAttribute('data-columns') ?? 1)
      const blocks = Array.from(view.querySelectorAll('[data-segnavia-block]')).map((node) => Number(node.getAttribute('data-segnavia-block')))
      const children = blocks.map((index) => flow.children[index]).filter((child): child is Element => child !== undefined)
      const runIndex = columns > 1 ? blocks.find((index) => Number(flow.children[index]?.getAttribute('data-columns')) === columns) : undefined
      const run = runIndex === undefined ? undefined : flow.children[runIndex]
      if (run?.hasAttribute('data-column-fit-check')) continue
      const runBox = run?.getBoundingClientRect()
      const scaledExtents = scaledExtentsFor(children, flowBox.top)
      windows.push({
        flow: flowId,
        column: Number(view.getAttribute('data-column') ?? 0),
        columns,
        run: runIndex,
        start: Number(view.getAttribute('data-start')),
        end: Number(view.getAttribute('data-end')),
        windowIndex,
        flowLeft: flowBox.left,
        runLeft: runBox?.left,
        width: viewBox.width,
        height: viewBox.height,
        top: Number(view.getAttribute('data-top')),
        blocks,
        scaledExtents,
      })
    }
    return windows
  })
  return windows.map(({ flowLeft, runLeft, ...view }) => ({ ...view, localX: galleyInlineOffset(view.columns, flowLeft, runLeft) }))
}

function windowSelector(index: number): string {
  return `[data-segnavia-window][data-segnavia-ink="${index}"]`
}

function flowSelector(flow: string): string {
  return `[data-segnavia-galley-source] [data-segnavia-flow="${flow}"]`
}

function bandHeight(windowHeight: number): number {
  return Math.max(1, Math.min(INK_BAND_PX, Math.floor(windowHeight)))
}

async function showGalley(frame: Frame) {
  return frame.evaluate(() => {
    const galleys = document.querySelector('[data-segnavia-galley-source]') as HTMLElement | null
    const pages = document.querySelector('[data-segnavia-pages]') as HTMLElement | null
    const held = { galley: galleys?.getAttribute('style') ?? null, pages: pages?.getAttribute('style') ?? null }
    if (galleys) galleys.style.cssText = 'position:absolute;inset-block-start:0;inset-inline-start:0;visibility:visible;z-index:20;'
    if (pages) pages.style.opacity = '0'
    return held
  })
}

async function restoreGalley(frame: Frame, held: { galley: string | null; pages: string | null }) {
  await frame.evaluate((styles) => {
    const galleys = document.querySelector('[data-segnavia-galley-source]') as HTMLElement | null
    const pages = document.querySelector('[data-segnavia-pages]') as HTMLElement | null
    if (galleys && styles.galley === null) galleys.removeAttribute('style')
    else if (galleys) galleys.setAttribute('style', styles.galley ?? '')
    if (pages && styles.pages === null) pages.removeAttribute('style')
    else if (pages) pages.setAttribute('style', styles.pages ?? '')
  }, held)
}

async function markWindows(frame: Frame) {
  await frame.evaluate(() => {
    const windows = document.querySelectorAll('[data-segnavia-window]')
    for (let index = 0; index < windows.length; index += 1) windows[index]?.setAttribute('data-segnavia-ink', String(index))
  })
}

async function unmarkWindows(frame: Frame) {
  await frame.evaluate(() => {
    for (const view of Array.from(document.querySelectorAll('[data-segnavia-ink]'))) view.removeAttribute('data-segnavia-ink')
  })
}

async function hideOutsideText(frame: Frame, hidden: boolean) {
  await frame.evaluate((hide) => {
    const nodes = document.querySelectorAll('[data-segnavia-head], [data-segnavia-foot], [data-segnavia-page-note], [data-segnavia-notes-galley]')
    for (const node of Array.from(nodes)) (node as HTMLElement).style.visibility = hide ? 'hidden' : ''
  }, hidden)
}

interface EdgeBands {
  galleyStart: InkImage
  galleyEnd: InkImage
  pageStart: InkImage
  pageEnd: InkImage
}

async function hideOtherGalleyBlocks(frame: Frame, view: InkWindow, hide: boolean) {
  await frame.evaluate(
    ({ flow, blocks, hide: hideBlocks }) => {
      const root = document.querySelector(`[data-segnavia-galley-source] [data-segnavia-flow="${flow}"]`)
      if (!root) return
      const kept = new Set(blocks)
      for (const [index, child] of Array.from(root.children).entries()) {
        if (child.tagName === 'STYLE' || child.tagName === 'SCRIPT') continue
        const held = child as HTMLElement
        if (!hideBlocks) {
          if (held.hasAttribute('data-segnavia-ink-hide')) held.style.visibility = ''
          held.removeAttribute('data-segnavia-ink-hide')
          continue
        }
        if (kept.has(index)) continue
        held.setAttribute('data-segnavia-ink-hide', '')
        held.style.visibility = 'hidden'
      }
    },
    { flow: view.flow, blocks: view.blocks, hide },
  )
}

async function captureGalleyBands(h: Harness, frame: Frame, windows: InkWindow[]): Promise<Array<{ start: InkImage; end: InkImage }>> {
  const bands: Array<{ start: InkImage; end: InkImage }> = []
  for (const view of windows) {
    const height = bandHeight(view.height)
    await hideOtherGalleyBlocks(frame, view, true)
    try {
      const start = await pngRgba(h, await screenshotBand(h, frame, flowSelector(view.flow), view.localX, view.start, view.width, height))
      const end = await pngRgba(h, await screenshotBand(h, frame, flowSelector(view.flow), view.localX, view.end - height, view.width, height))
      bands.push({ start, end })
    } finally {
      await hideOtherGalleyBlocks(frame, view, false)
    }
  }
  return bands
}

async function capturePageBands(h: Harness, frame: Frame, windows: InkWindow[]): Promise<Array<{ start: InkImage; end: InkImage }>> {
  const bands: Array<{ start: InkImage; end: InkImage }> = []
  for (const view of windows) {
    const height = bandHeight(view.height)
    const start = await pngRgba(h, await screenshotBand(h, frame, windowSelector(view.windowIndex), 0, 0, view.width, height))
    const end = await pngRgba(h, await screenshotBand(h, frame, windowSelector(view.windowIndex), 0, view.height - height, view.width, height))
    bands.push({ start, end })
  }
  return bands
}

function recordMismatch(view: InkWindow, side: Mismatch['side'], offset: number, galley: InkImage, page: InkImage, mismatches: Mismatch[]): void {
  const pageInk = inkBounds(page).count
  const galleyInk = inkBounds(galley).count
  if (side === 'start' && pageInk === 0) return
  const diff = presenceDiff(galley, page)
  if (diff.over <= INK_PIXEL_TOLERANCE) return
  mismatches.push({
    flow: view.flow,
    column: view.column,
    side,
    offset,
    over: diff.over,
    lost: diff.lost,
    extra: diff.extra,
    galleyInk,
    pageInk,
    galleySize: [galley.width, galley.height],
    pageSize: [page.width, page.height],
  })
}

function lastOfColumn(windows: InkWindow[]): Set<number> {
  const last = new Set<number>()
  for (const ordered of groupedWindowIndexes(windows, columnGroupKey)) {
    const tail = ordered[ordered.length - 1]
    if (tail !== undefined) last.add(tail)
  }
  return last
}

function recordInside(view: InkWindow, side: 'start' | 'end', galley: InkImage, page: InkImage, mismatches: Mismatch[]): void {
  recordMismatch(view, side, side === 'start' ? view.start : view.end, galley, page, mismatches)
}

function recordBreak(
  previous: InkWindow,
  next: InkWindow,
  previousBands: EdgeBands,
  nextBands: EdgeBands,
  comparePixels: boolean,
  mismatches: Mismatch[],
): boolean {
  const gap = next.start - previous.end
  if (gap > 0.5) {
    mismatches.push({ flow: previous.flow, column: previous.column, side: 'break', offset: previous.end, over: gap, lost: gap, extra: 0 })
    return false
  }
  // A constrained replaced element is resampled onto different page and galley pixel grids, so only an edge band that intersects it is incomparable.
  if (!comparePixels) return false
  recordMismatch(
    previous,
    'break',
    previous.end,
    stackImages(previousBands.galleyEnd, nextBands.galleyStart),
    stackImages(previousBands.pageEnd, nextBands.pageStart),
    mismatches,
  )
  return true
}

export async function compareHebrewInk(h: Harness, frame: Frame) {
  const windows = await collectWindows(frame)
  const pairs = sequentialPairs(windows)
  await markWindows(frame)
  await hideOutsideText(frame, true)
  const pageBands = await capturePageBands(h, frame, windows)
  const held = await showGalley(frame)
  const galleyBands = await captureGalleyBands(h, frame, windows)
  await restoreGalley(frame, held)
  await unmarkWindows(frame)
  await hideOutsideText(frame, false)
  const mismatches: Mismatch[] = []
  const comparedBands = new Set<string>()
  const last = lastOfColumn(windows)
  for (const [index, view] of windows.entries()) {
    const galley = galleyBands[index]
    const page = pageBands[index]
    if (!galley || !page) continue
    const height = bandHeight(view.height)
    if (!intersectsScaledExtent({ start: view.start, end: view.start + height }, view.scaledExtents)) {
      recordInside(view, 'start', galley.start, page.start, mismatches)
      comparedBands.add(`${index}:start`)
    }
    if (!last.has(index) && !intersectsScaledExtent({ start: view.end - height, end: view.end }, view.scaledExtents)) {
      recordInside(view, 'end', galley.end, page.end, mismatches)
      comparedBands.add(`${index}:end`)
    }
  }
  for (const pair of pairs) {
    const previous = galleyBands[pair.previousIndex]
    const next = galleyBands[pair.nextIndex]
    const previousPage = pageBands[pair.previousIndex]
    const nextPage = pageBands[pair.nextIndex]
    if (!previous || !next || !previousPage || !nextPage) continue
    const previousHeight = bandHeight(pair.previous.height)
    const nextHeight = bandHeight(pair.next.height)
    const comparePixels =
      !intersectsScaledExtent({ start: pair.previous.end - previousHeight, end: pair.previous.end }, pair.previous.scaledExtents) &&
      !intersectsScaledExtent({ start: pair.next.start, end: pair.next.start + nextHeight }, pair.next.scaledExtents)
    if (
      recordBreak(
        pair.previous,
        pair.next,
        { galleyStart: previous.start, galleyEnd: previous.end, pageStart: previousPage.start, pageEnd: previousPage.end },
        { galleyStart: next.start, galleyEnd: next.end, pageStart: nextPage.start, pageEnd: nextPage.end },
        comparePixels,
        mismatches,
      )
    ) {
      comparedBands.add(`${pair.previousIndex}:end`)
      comparedBands.add(`${pair.nextIndex}:start`)
    }
  }
  return {
    ok: mismatches.length === 0 && windows.length > 0,
    detail: JSON.stringify({
      compared: comparedBands.size,
      breaks: pairs.length,
      mismatched: mismatches.length,
      lost: mismatches.reduce((sum, item) => sum + item.lost, 0),
      extra: mismatches.reduce((sum, item) => sum + item.extra, 0),
      neighborhood: INK_NEIGHBORHOOD_PX,
      leftover: INK_PIXEL_TOLERANCE,
      band: INK_BAND_PX,
      first: mismatches,
    }),
  }
}
