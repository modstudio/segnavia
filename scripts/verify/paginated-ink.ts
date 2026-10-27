import type { Frame } from 'playwright-core'
import type { Harness } from './harness.ts'

// A few CSS pixels into the window, and a channel may differ by 32/255 for antialiasing.
const INK_BAND_PX = 8
const INK_CHANNEL_TOLERANCE = 32

interface InkWindow {
  flow: string
  column: number
  start: number
  end: number
  windowIndex: number
  localX: number
  width: number
  height: number
}

interface InkImage {
  width: number
  height: number
  data: number[]
}

interface PixelDiff {
  over: number
  worst: number
}

interface Mismatch {
  flow: string
  column: number
  side?: 'start' | 'end' | 'break'
  offset: number
  over: number
  worst: number
  shift: number
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

function isInk(red: number, green: number, blue: number): boolean {
  return Math.min(red, green, blue) < 240
}

function sample(image: InkImage, x: number, y: number): [number, number, number] {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return [255, 255, 255]
  const index = (y * image.width + x) * 4
  return [image.data[index] ?? 255, image.data[index + 1] ?? 255, image.data[index + 2] ?? 255]
}

function channelDelta(left: [number, number, number], right: [number, number, number]): number {
  return Math.max(Math.abs(left[0] - right[0]), Math.abs(left[1] - right[1]), Math.abs(left[2] - right[2]))
}

function diffAtShift(galley: InkImage, composed: InkImage, dy: number): PixelDiff {
  const height = Math.min(galley.height, composed.height)
  const width = Math.min(galley.width, composed.width)
  let over = 0
  let worst = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const fromGalley = sample(galley, x, y)
      const fromPage = sample(composed, x, y + dy)
      if (!isInk(fromGalley[0], fromGalley[1], fromGalley[2]) && !isInk(fromPage[0], fromPage[1], fromPage[2])) continue
      const delta = channelDelta(fromGalley, fromPage)
      if (delta > worst) worst = delta
      if (delta > INK_CHANNEL_TOLERANCE) over += 1
    }
  }
  return { over, worst }
}

function bestShift(galley: InkImage, composed: InkImage): PixelDiff & { shift: number } {
  let best = { over: Number.POSITIVE_INFINITY, worst: 0, shift: 0 }
  for (const dy of [-1, 0, 1]) {
    const diff = diffAtShift(galley, composed, dy)
    if (diff.over < best.over || (diff.over === best.over && dy === 0)) best = { ...diff, shift: dy }
  }
  return best
}

function inkCount(image: InkImage): number {
  let count = 0
  for (let index = 0; index + 2 < image.data.length; index += 4) {
    if (isInk(image.data[index] ?? 0, image.data[index + 1] ?? 0, image.data[index + 2] ?? 0)) count += 1
  }
  return count
}

function stackImages(top: InkImage, bottom: InkImage): InkImage {
  const width = Math.min(top.width, bottom.width)
  const height = top.height + bottom.height
  const data = new Array(width * height * 4).fill(255)
  const write = (source: InkImage, y0: number) => {
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const from = (y * source.width + x) * 4
        const to = ((y0 + y) * width + x) * 4
        data[to] = source.data[from] ?? 255
        data[to + 1] = source.data[from + 1] ?? 255
        data[to + 2] = source.data[from + 2] ?? 255
        data[to + 3] = 255
      }
    }
  }
  write(top, 0)
  write(bottom, top.height)
  return { width, height, data }
}

async function screenshotBand(frame: Frame, selector: string, localX: number, localY: number, width: number, height: number) {
  const handle = await frame.$(selector)
  if (!handle) throw new Error(`The paginated book has no ${selector}.`)
  await handle.evaluate((element, y) => {
    const box = element.getBoundingClientRect()
    const root = document.scrollingElement
    if (!root) return
    root.scrollTop += box.top + y - innerHeight / 2
  }, localY)
  const size = await handle.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { width: box.width, height: box.height }
  })
  const clipX = Math.max(0, localX)
  const clipY = Math.max(0, localY)
  return handle.screenshot({
    clip: {
      x: clipX,
      y: clipY,
      width: Math.max(1, Math.min(width, size.width - clipX)),
      height: Math.max(1, Math.min(height, size.height - clipY)),
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

async function captureGalleyBands(h: Harness, frame: Frame, windows: InkWindow[]): Promise<Array<{ start: InkImage; end: InkImage }>> {
  const bands: Array<{ start: InkImage; end: InkImage }> = []
  for (const view of windows) {
    const height = bandHeight(view.height)
    const start = await pngRgba(h, await screenshotBand(frame, flowSelector(view.flow), view.localX, view.start, view.width, height))
    const end = await pngRgba(h, await screenshotBand(frame, flowSelector(view.flow), view.localX, view.end - height, view.width, height))
    bands.push({ start, end })
  }
  return bands
}

async function capturePageBands(h: Harness, frame: Frame, windows: InkWindow[]): Promise<Array<{ start: InkImage; end: InkImage }>> {
  const bands: Array<{ start: InkImage; end: InkImage }> = []
  for (const view of windows) {
    const height = bandHeight(view.height)
    const start = await pngRgba(h, await screenshotBand(frame, windowSelector(view.windowIndex), 0, 0, view.width, height))
    const end = await pngRgba(h, await screenshotBand(frame, windowSelector(view.windowIndex), 0, view.height - height, view.width, height))
    bands.push({ start, end })
  }
  return bands
}

function recordInside(view: InkWindow, side: 'start' | 'end', galley: InkImage, page: InkImage, mismatches: Mismatch[]): void {
  if (galley.width !== page.width || galley.height !== page.height) {
    mismatches.push({ flow: view.flow, column: view.column, side, offset: side === 'start' ? view.start : view.end, over: 1, worst: 255, shift: 0 })
    return
  }
  const aligned = diffAtShift(galley, page, 0)
  if (aligned.over === 0) return
  const shifted = bestShift(galley, page)
  mismatches.push({
    flow: view.flow,
    column: view.column,
    side,
    offset: side === 'start' ? view.start : view.end,
    over: aligned.over,
    worst: aligned.worst,
    shift: shifted.over === 0 ? shifted.shift : 0,
  })
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
      pairs.push({ previous, next, previousIndex, nextIndex })
    }
  }
  return pairs
}

async function gapInk(h: Harness, frame: Frame, previous: InkWindow, next: InkWindow): Promise<number> {
  const gap = next.start - previous.end
  if (gap <= 0.5) return 0
  const png = await screenshotBand(frame, flowSelector(previous.flow), previous.localX, previous.end, previous.width, gap)
  return inkCount(await pngRgba(h, png))
}

function recordBreak(previous: InkWindow, previousBands: EdgeBands, nextBands: EdgeBands, gap: number, mismatches: Mismatch[]): void {
  if (gap > 0) {
    mismatches.push({ flow: previous.flow, column: previous.column, side: 'break', offset: previous.end, over: gap, worst: 255, shift: 0 })
    return
  }
  const galley = stackImages(previousBands.galleyEnd, nextBands.galleyStart)
  const page = stackImages(previousBands.pageEnd, nextBands.pageStart)
  if (galley.width !== page.width || galley.height !== page.height) {
    mismatches.push({ flow: previous.flow, column: previous.column, side: 'break', offset: previous.end, over: 1, worst: 255, shift: 0 })
    return
  }
  const aligned = diffAtShift(galley, page, 0)
  if (aligned.over === 0) return
  const shifted = bestShift(galley, page)
  mismatches.push({
    flow: previous.flow,
    column: previous.column,
    side: 'break',
    offset: previous.end,
    over: aligned.over,
    worst: aligned.worst,
    shift: shifted.over === 0 ? shifted.shift : 0,
  })
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
      worst: mismatches.reduce((max, item) => Math.max(max, item.worst), 0),
      shifts: mismatches.map((item) => item.shift),
      tolerance: INK_CHANNEL_TOLERANCE,
      band: INK_BAND_PX,
      first: mismatches.slice(0, 8),
    }),
  }
}
