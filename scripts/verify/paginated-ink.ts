import type { Frame } from 'playwright-core'
import type { Harness } from './harness.ts'
import { INK_BAND_PX, INK_NEIGHBORHOOD_PX, type InkImage, inkBounds, inkCount, presenceDiff, stackImages } from './paginated-ink-pixels.ts'

interface InkWindow {
  flow: string
  column: number
  start: number
  end: number
  top: number
  windowIndex: number
  localX: number
  width: number
  height: number
}

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
      x: Math.round(clipX),
      y: Math.round(clipY),
      width: Math.max(1, Math.round(Math.min(width, maxX - clipX))),
      height: Math.max(1, Math.round(Math.min(height, maxY - clipY))),
    },
    animations: 'disabled',
  })
}

async function collectWindows(frame: Frame): Promise<InkWindow[]> {
  return frame.evaluate(() => {
    const windows: InkWindow[] = []
    const views = Array.from(document.querySelectorAll('[data-segnavia-window]'))
    for (const [windowIndex, view] of views.entries()) {
      const flowId = view.getAttribute('data-flow') ?? ''
      const flow = document.querySelector(`[data-segnavia-galley-source] [data-segnavia-flow="${flowId}"]`)
      if (!flow) continue
      const flowBox = flow.getBoundingClientRect()
      const viewBox = view.getBoundingClientRect()
      const stamped = view.querySelector('[data-segnavia-block]')?.getAttribute('data-segnavia-block')
      const child = stamped === undefined || stamped === null ? undefined : flow.children[Number(stamped)]
      windows.push({
        flow: flowId,
        column: Number(view.getAttribute('data-column') ?? 0),
        start: Number(view.getAttribute('data-start')),
        end: Number(view.getAttribute('data-end')),
        windowIndex,
        localX: child ? Math.max(0, child.getBoundingClientRect().left - flowBox.left) : 0,
        width: viewBox.width,
        height: viewBox.height,
        top: Number(view.getAttribute('data-top')),
      })
    }
    return windows
  })
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
    const held = { galley: galleys?.getAttribute('style') ?? '', pages: pages?.getAttribute('style') ?? '' }
    if (galleys) galleys.style.cssText = 'position:absolute;inset-block-start:0;inset-inline-start:0;visibility:visible;z-index:20;'
    if (pages) pages.style.visibility = 'hidden'
    return held
  })
}

async function restoreGalley(frame: Frame, held: { galley: string; pages: string }) {
  await frame.evaluate((styles) => {
    const galleys = document.querySelector('[data-segnavia-galley-source]') as HTMLElement | null
    const pages = document.querySelector('[data-segnavia-pages]') as HTMLElement | null
    if (galleys) galleys.setAttribute('style', styles.galley)
    if (pages) pages.setAttribute('style', styles.pages)
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

function galleyBlockExtent(held: Element, origin: number): { top: number; bottom: number } {
  const range = document.createRange()
  range.selectNodeContents(held)
  const rects = Array.from(range.getClientRects())
  if (!rects.length) {
    const box = held.getBoundingClientRect()
    return { top: box.top - origin, bottom: box.bottom - origin }
  }
  return { top: Math.min(...rects.map((rect) => rect.top - origin)), bottom: Math.max(...rects.map((rect) => rect.bottom - origin)) }
}

async function hideOtherGalleyBlocks(frame: Frame, view: InkWindow, hide: boolean) {
  await frame.evaluate(
    ({ flow, start, end, hide: hideBlocks, extentSrc }) => {
      const extent = new Function('held', 'origin', `return (${extentSrc})(held, origin)`) as typeof galleyBlockExtent
      const root = document.querySelector(`[data-segnavia-galley-source] [data-segnavia-flow="${flow}"]`)
      if (!root) return
      const origin = root.getBoundingClientRect().top
      for (const child of Array.from(root.children)) {
        if (child.tagName === 'STYLE' || child.tagName === 'SCRIPT') continue
        const held = child as HTMLElement
        if (!hideBlocks) {
          held.style.visibility = held.hasAttribute('data-segnavia-ink-hide') ? '' : held.style.visibility
          held.removeAttribute('data-segnavia-ink-hide')
          continue
        }
        const box = extent(held, origin)
        if (box.bottom > start && box.top < end) continue
        held.setAttribute('data-segnavia-ink-hide', '')
        held.style.visibility = 'hidden'
      }
    },
    { flow: view.flow, start: view.start, end: view.end, hide, extentSrc: galleyBlockExtent.toString() },
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
  const diff = presenceDiff(galley, page)
  if (diff.over === 0) return
  mismatches.push({
    flow: view.flow,
    column: view.column,
    side,
    offset,
    over: diff.over,
    lost: diff.lost,
    extra: diff.extra,
    galleyInk: inkBounds(galley).count,
    pageInk: inkBounds(page).count,
  })
}

function recordInside(view: InkWindow, side: 'start' | 'end', galley: InkImage, page: InkImage, mismatches: Mismatch[]): void {
  recordMismatch(view, side, side === 'start' ? view.start : view.end, galley, page, mismatches)
}

function sequentialPairs(windows: InkWindow[]): Array<{ previous: InkWindow; next: InkWindow; previousIndex: number; nextIndex: number }> {
  const groups = new Map<string, number[]>()
  for (const [index, view] of windows.entries()) {
    const key = `${view.flow}:${view.column}`
    groups.set(key, [...(groups.get(key) ?? []), index])
  }
  const pairs: Array<{ previous: InkWindow; next: InkWindow; previousIndex: number; nextIndex: number }> = []
  for (const indexes of groups.values()) {
    const ordered = [...indexes].sort((left, right) => (windows[left]?.start ?? 0) - (windows[right]?.start ?? 0))
    for (let index = 0; index + 1 < ordered.length; index += 1) {
      const previousIndex = ordered[index] ?? 0
      const nextIndex = ordered[index + 1] ?? 0
      const previous = windows[previousIndex]
      const next = windows[nextIndex]
      if (!previous || !next || previous.end > next.start + 0.5) continue
      // Other column runs sit between same-column windows in galley order; only near edges are page breaks.
      if (next.start - previous.end > 40) continue
      pairs.push({ previous, next, previousIndex, nextIndex })
    }
  }
  return pairs
}

async function gapInk(h: Harness, frame: Frame, previous: InkWindow, next: InkWindow): Promise<number> {
  const gap = next.start - previous.end
  if (gap <= 0.5) return 0
  const png = await screenshotBand(h, frame, flowSelector(previous.flow), previous.localX, previous.end, previous.width, gap)
  return inkCount(await pngRgba(h, png))
}

function recordBreak(previous: InkWindow, previousBands: EdgeBands, nextBands: EdgeBands, gap: number, mismatches: Mismatch[]): void {
  if (gap > 0) {
    mismatches.push({ flow: previous.flow, column: previous.column, side: 'break', offset: previous.end, over: gap, lost: gap, extra: 0 })
    return
  }
  recordMismatch(
    previous,
    'break',
    previous.end,
    stackImages(previousBands.galleyEnd, nextBands.galleyStart),
    stackImages(previousBands.pageEnd, nextBands.pageStart),
    mismatches,
  )
}

export async function compareHebrewInk(h: Harness, frame: Frame) {
  const windows = await collectWindows(frame)
  const held = await showGalley(frame)
  await hideOutsideText(frame, true)
  const galleyBands = await captureGalleyBands(h, frame, windows)
  const pairs = sequentialPairs(windows)
  const gaps: number[] = []
  for (const pair of pairs) gaps.push(await gapInk(h, frame, pair.previous, pair.next))
  await restoreGalley(frame, held)
  await markWindows(frame)
  await hideOutsideText(frame, true)
  const pageBands = await capturePageBands(h, frame, windows)
  await unmarkWindows(frame)
  await hideOutsideText(frame, false)
  const mismatches: Mismatch[] = []
  for (const [index, view] of windows.entries()) {
    const galley = galleyBands[index]
    const page = pageBands[index]
    if (!galley || !page) continue
    recordInside(view, 'start', galley.start, page.start, mismatches)
    recordInside(view, 'end', galley.end, page.end, mismatches)
  }
  for (const [index, pair] of pairs.entries()) {
    const previous = galleyBands[pair.previousIndex]
    const next = galleyBands[pair.nextIndex]
    const previousPage = pageBands[pair.previousIndex]
    const nextPage = pageBands[pair.nextIndex]
    if (!previous || !next || !previousPage || !nextPage) continue
    recordBreak(
      pair.previous,
      { galleyStart: previous.start, galleyEnd: previous.end, pageStart: previousPage.start, pageEnd: previousPage.end },
      { galleyStart: next.start, galleyEnd: next.end, pageStart: nextPage.start, pageEnd: nextPage.end },
      gaps[index] ?? 0,
      mismatches,
    )
  }
  return {
    ok: mismatches.length === 0 && windows.length > 0,
    detail: JSON.stringify({
      compared: windows.length * 2,
      breaks: pairs.length,
      mismatched: mismatches.length,
      lost: mismatches.reduce((sum, item) => sum + item.lost, 0),
      extra: mismatches.reduce((sum, item) => sum + item.extra, 0),
      neighborhood: INK_NEIGHBORHOOD_PX,
      band: INK_BAND_PX,
      first: mismatches,
    }),
  }
}
