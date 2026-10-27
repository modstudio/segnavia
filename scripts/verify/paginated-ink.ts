import type { Frame } from 'playwright-core'
import type { Harness } from './harness.ts'

const INK_BAND_PX = 3
const INK_CHANNEL_TOLERANCE = 24

interface InkEdge {
  flow: string
  side: 'start' | 'end'
  offset: number
  windowIndex: number
  localX: number
  width: number
  pointed: boolean
}

async function pngRgba(h: Harness, png: Buffer) {
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
  return Math.min(red, green, blue) < 250
}

function inkMismatch(galley: number[], composed: number[]): { over: number; worst: number } {
  const limit = Math.min(galley.length, composed.length)
  let over = 0
  let worst = 0
  for (let index = 0; index + 2 < limit; index += 4) {
    const red = galley[index] ?? 0
    const green = galley[index + 1] ?? 0
    const blue = galley[index + 2] ?? 0
    if (!isInk(red, green, blue)) continue
    const delta = Math.max(Math.abs(red - (composed[index] ?? 0)), Math.abs(green - (composed[index + 1] ?? 0)), Math.abs(blue - (composed[index + 2] ?? 0)))
    if (delta > worst) worst = delta
    if (delta > INK_CHANNEL_TOLERANCE) over += 1
  }
  return { over, worst }
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
      return { x: box.left + arg.x, y: box.top + arg.y }
    },
    { x: localX, y: localY },
  )
  const frameEl = await frame.frameElement()
  const iframeBox = await frameEl.boundingBox()
  if (!iframeBox) throw new Error(`The paginated book frame has no box for ${selector}.`)
  const x = iframeBox.x + local.x
  const y = iframeBox.y + local.y
  const maxX = iframeBox.x + iframeBox.width
  const maxY = iframeBox.y + iframeBox.height
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

async function collectInkEdges(frame: Frame): Promise<InkEdge[]> {
  return frame.evaluate(() => {
    function originTop(element: Element) {
      return element.getBoundingClientRect().top
    }
    function lineBoxes(element: Element, origin: number) {
      const range = document.createRange()
      range.selectNodeContents(element)
      const groups: Array<{ top: number; bottom: number }> = []
      for (const rect of Array.from(range.getClientRects())) {
        const top = rect.top - origin
        const bottom = rect.bottom - origin
        const found = groups.find((group) => Math.abs(group.top - top) < 0.5)
        if (!found) groups.push({ top, bottom })
        else if (bottom > found.bottom) found.bottom = bottom
      }
      return groups.sort((left, right) => left.top - right.top)
    }
    function pointedAt(flow: Element, origin: number, offset: number) {
      return Array.from(document.querySelectorAll('[data-segnavia-galley-source] [data-pointed]')).some((node) => {
        if (node.closest('[data-segnavia-flow]') !== flow) return false
        const lines = lineBoxes(node, origin)
        const first = lines[0]
        const last = lines[lines.length - 1]
        return Boolean(first && last && offset > first.top + 0.5 && offset < last.bottom - 0.5)
      })
    }
    const edges: InkEdge[] = []
    const windows = Array.from(document.querySelectorAll('[data-segnavia-window]'))
    for (const [windowIndex, view] of windows.entries()) {
      const flowId = view.getAttribute('data-flow') ?? ''
      const flow = document.querySelector(`[data-segnavia-galley-source] [data-segnavia-flow="${flowId}"]`)
      if (!flow) continue
      const origin = originTop(flow)
      const flowBox = flow.getBoundingClientRect()
      const viewBox = view.getBoundingClientRect()
      const start = Number(view.getAttribute('data-start'))
      const end = Number(view.getAttribute('data-end'))
      const stamped = view.querySelector('[data-segnavia-block]')?.getAttribute('data-segnavia-block')
      const child = stamped === undefined || stamped === null ? undefined : flow.children[Number(stamped)]
      const localX = child ? Math.max(0, child.getBoundingClientRect().left - flowBox.left) : 0
      edges.push({ flow: flowId, side: 'start', offset: start, windowIndex, localX, width: viewBox.width, pointed: pointedAt(flow, origin, start) })
      edges.push({ flow: flowId, side: 'end', offset: end, windowIndex, localX, width: viewBox.width, pointed: pointedAt(flow, origin, end) })
    }
    return edges
  })
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

function windowSelector(index: number): string {
  return `[data-segnavia-window][data-segnavia-ink="${index}"]`
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

function inkBand(side: InkEdge['side']): { galleyY: (offset: number) => number; windowY: (height: number) => number; height: number } {
  if (side === 'start') return { galleyY: (offset) => offset, windowY: () => 0, height: INK_BAND_PX }
  return { galleyY: (offset) => offset - INK_BAND_PX, windowY: (height) => height - INK_BAND_PX, height: INK_BAND_PX }
}

async function hideFurniture(frame: Frame, hidden: boolean) {
  await frame.evaluate((hide) => {
    for (const node of Array.from(document.querySelectorAll('[data-segnavia-head], [data-segnavia-foot]'))) {
      ;(node as HTMLElement).style.visibility = hide ? 'hidden' : ''
    }
  }, hidden)
}

async function pointedEndOutsideLost(h: Harness, frame: Frame, edges: InkEdge[]) {
  let lost = 0
  let worst = 0
  for (const edge of edges) {
    if (edge.side !== 'end' || !edge.pointed) continue
    const png = await screenshotBand(
      h,
      frame,
      `[data-segnavia-galley-source] [data-segnavia-flow="${edge.flow}"]`,
      edge.localX,
      edge.offset,
      edge.width,
      INK_BAND_PX,
    )
    const galley = await pngRgba(h, png)
    const white = Array.from({ length: galley.data.length }, () => 255)
    const diff = inkMismatch(galley.data, white)
    if (diff.worst > worst) worst = diff.worst
    if (diff.over > 0) lost += 1
  }
  return { lost, worst }
}

export async function compareHebrewInk(h: Harness, frame: Frame) {
  const edges = await collectInkEdges(frame)
  const held = await showGalley(frame)
  const galleyBands: Buffer[] = []
  for (const edge of edges) {
    const band = inkBand(edge.side)
    galleyBands.push(
      await screenshotBand(
        h,
        frame,
        `[data-segnavia-galley-source] [data-segnavia-flow="${edge.flow}"]`,
        edge.localX,
        band.galleyY(edge.offset),
        edge.width,
        band.height,
      ),
    )
  }
  const outside = await pointedEndOutsideLost(h, frame, edges)
  await restoreGalley(frame, held)
  await markWindows(frame)
  await hideFurniture(frame, true)
  let mismatched = 0
  let pointedEdges = 0
  let worst = 0
  for (const [index, edge] of edges.entries()) {
    const height = await frame.evaluate((i) => document.querySelectorAll('[data-segnavia-window]')[i]?.getBoundingClientRect().height ?? 0, edge.windowIndex)
    const band = inkBand(edge.side)
    const composed = await screenshotBand(h, frame, windowSelector(edge.windowIndex), 0, band.windowY(height), edge.width, band.height)
    const galley = await pngRgba(h, galleyBands[index] ?? Buffer.from([]))
    const page = await pngRgba(h, composed)
    if (edge.pointed) pointedEdges += 1
    const diff = galley.width !== page.width || galley.height !== page.height ? { over: 1, worst: 255 } : inkMismatch(galley.data, page.data)
    if (!edge.pointed) continue
    if (diff.worst > worst) worst = diff.worst
    if (diff.over > 0) mismatched += 1
  }
  await unmarkWindows(frame)
  await hideFurniture(frame, false)
  return {
    ok: mismatched === 0 && outside.lost === 0 && edges.length > 0 && pointedEdges > 0,
    detail: JSON.stringify({
      compared: edges.length,
      mismatched,
      pointedEdges,
      outsideLost: outside.lost,
      worst: Math.max(worst, outside.worst),
      tolerance: INK_CHANNEL_TOLERANCE,
      band: INK_BAND_PX,
    }),
  }
}
