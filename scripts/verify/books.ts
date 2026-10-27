import path from 'node:path'
import type { Frame } from 'playwright-core'
import { EVIDENCE, type Harness } from './harness.ts'
import { inspectPaginatedBook, type PaginatedReport } from './paginated-inspect.ts'

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

async function screenshotBand(_h: Harness, frame: Frame, selector: string, localX: number, localY: number, width: number, height: number) {
  const handle = await frame.$(selector)
  if (!handle) throw new Error(`The paginated book has no ${selector}.`)
  const size = await handle.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { width: box.width, height: box.height }
  })
  const x = Math.max(0, localX)
  const y = Math.max(0, localY)
  return handle.screenshot({
    clip: {
      x,
      y,
      width: Math.max(1, Math.min(width, size.width - x)),
      height: Math.max(1, Math.min(height, size.height - y)),
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

async function compareHebrewInk(h: Harness, frame: Frame) {
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
    if (diff.worst > worst) worst = diff.worst
    if (diff.over > 0) mismatched += 1
  }
  await unmarkWindows(frame)
  await hideFurniture(frame, false)
  return {
    ok: mismatched === 0 && edges.length > 0 && pointedEdges > 0,
    detail: JSON.stringify({
      compared: edges.length,
      mismatched,
      pointedEdges,
      worst,
      tolerance: INK_CHANNEL_TOLERANCE,
      band: INK_BAND_PX,
    }),
  }
}

const BRIDGE_MESSAGES = new Set(['segnavia:key', 'segnavia:height', 'segnavia:ready', 'segnavia:animation', 'segnavia:slot-fit'])

async function inView(h: Harness, frame: string, selector: string): Promise<boolean> {
  return h.page
    .frameLocator(`${frame} iframe`)
    .locator(selector)
    .evaluate((element) => {
      const box = element.getBoundingClientRect()
      return box.bottom > 0 && box.top < innerHeight
    })
}

async function clickAnchor(h: Harness, frame: string, selector: string) {
  // Activate in the document so the check tests the link handler, not browser pointer routing into a sandboxed frame.
  await h.page
    .frameLocator(`${frame} iframe`)
    .locator(selector)
    .first()
    .evaluate((element: HTMLAnchorElement) => element.click())
}

export async function verifyBooks(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('book.html'))
  await Promise.all(['#book-en', '#book-he'].map((book) => page.frameLocator(`${book} iframe`).locator('.segnavia-contents-list').waitFor()))

  const geometry = await page.evaluate(() => ({
    heights: ['book-en', 'book-he'].map((id) => document.getElementById(id)?.getBoundingClientRect().height),
    hostScroll: scrollY,
    hostHeight: document.documentElement.scrollHeight,
    viewport: innerHeight,
  }))
  check(
    'continuous books stay 400px tall without scrolling the host page',
    geometry.heights.every((height) => height === 400) && geometry.hostScroll === 0 && geometry.hostHeight === geometry.viewport,
    JSON.stringify(geometry),
  )

  for (const id of ['book-en', 'book-he'] as const) {
    const frame = `#${id}`
    await page
      .frameLocator(`${frame} iframe`)
      .locator('body')
      .evaluate(() => scrollTo(0, 0))
    await page.locator(frame).screenshot({ path: path.join(EVIDENCE, `${id}-top.png`) })
    await clickAnchor(h, frame, '.segnavia-contents-entry a')
    const contents = await inView(h, frame, '#segnavia-chapter-1 h1')
    const href = await page
      .frameLocator(`${frame} iframe`)
      .locator('body')
      .evaluate(() => window.location.href)
    const hostScroll = await page.evaluate(() => scrollY)
    check(`${id} contents scroll the chapter into the frame`, contents && href === 'about:srcdoc' && hostScroll === 0, JSON.stringify({ href, hostScroll }))
    await page.locator(frame).screenshot({ path: path.join(EVIDENCE, `${id}-contents.png`) })

    await clickAnchor(h, frame, '#segnavia-fnref-1-1')
    check(`${id} footnote marker brings its note into view`, await inView(h, frame, '#segnavia-fn-1-1'))
    await clickAnchor(h, frame, '#segnavia-fn-1-1 a')
    check(`${id} footnote back-link returns to its marker`, await inView(h, frame, '#segnavia-fnref-1-1'))

    await clickAnchor(h, frame, '#segnavia-enref-1')
    const endnote = await inView(h, frame, '#segnavia-en-1')
    const endSection = await inView(h, frame, '#segnavia-endnotes')
    check(`${id} endnote marker reaches the endnotes section`, endnote && endSection)
  }

  const direction = await page.frameLocator('#book-he iframe').locator('html').getAttribute('dir')
  check('the Hebrew continuous book root is right to left', direction === 'rtl', String(direction))
  const messages = await page.evaluate(() => (window as unknown as { __messages: string[] }).__messages)
  check(
    'continuous books use only declared bridge message kinds',
    messages.every((kind) => BRIDGE_MESSAGES.has(kind)),
    messages.join(','),
  )

  await verifyPaginatedBooks(h)
}

async function paginatedFrame(h: Harness, id: string) {
  const element = await h.page.$(`#${id}`)
  const frame = await element?.contentFrame()
  if (!frame) throw new Error(`The paginated book frame ${id} did not load.`)
  await frame.waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
    undefined,
    { timeout: 20_000 },
  )
  return frame
}

async function inspectPaginated(h: Harness, id: string): Promise<PaginatedReport> {
  const frame = await paginatedFrame(h, id)
  return frame.evaluate(inspectPaginatedBook)
}

async function verifyPaginatedBooks(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('book-paginated.html'))
  for (const id of ['book-paginated-en', 'book-paginated-he'] as const) {
    const frame = await paginatedFrame(h, id)
    const report = await inspectPaginated(h, id)
    check(`${id} composed without a planner refusal`, !report.failure && report.pages > 1, report.failure ?? `${report.pages} pages`)
    check(
      `${id} every galley line is on exactly one window`,
      report.lost === 0 && report.repeated === 0,
      JSON.stringify({ lost: report.lost, repeated: report.repeated }),
    )
    check(
      `${id} each block appears only in the windows its extent intersects`,
      report.blocks.extra === 0 && report.blocks.missing === 0 && report.blocks.shown > 0,
      JSON.stringify(report.blocks),
    )
    check(
      `${id} each placed line sits at its galley position minus the window start`,
      report.lines.shifted === 0 && report.lines.checked > 0,
      JSON.stringify(report.lines),
    )
    check(
      `${id} every footnote is on its ref's page or continues from it`,
      report.notes.length > 0 && report.notes.every((note) => note.ok),
      JSON.stringify(report.notes),
    )
    check(
      `${id} column windows keep the galley's lines, balanced to one line`,
      report.columns.lost === 0 && report.columns.repeated === 0 && report.columns.balanced,
      JSON.stringify(report.columns),
    )
    check(
      `${id} blanks have no furniture and openers have no running head`,
      report.furniture.blanksHaveNone && report.furniture.openersHaveNoHead && report.furniture.bodyHasFolio,
      JSON.stringify(report.furniture),
    )
    check(`${id} contents page numbers equal the chapters' first pages`, report.contents.matches, report.contents.detail)
    check(`${id} window edges sit on line-box midpoints`, report.clip.midpoint, JSON.stringify(report.clip))
    if (id === 'book-paginated-he') {
      const ink = await compareHebrewInk(h, frame)
      check(`${id} no niqqud or taamim ink is lost at any window edge`, ink.ok, ink.detail)
    }
    check(
      `${id} running heads take the first mark and carry onto a page with none`,
      report.runningHead.fromMark && report.runningHead.carried,
      report.runningHead.detail,
    )

    await frame
      .locator('.segnavia-contents-entry a')
      .first()
      .evaluate((element: HTMLAnchorElement) => element.click())
    const landed = await frame.evaluate(() => {
      const target = document.getElementById('segnavia-chapter-1')
      if (!target) return false
      const box = target.getBoundingClientRect()
      return box.bottom > 0 && box.top < innerHeight
    })
    check(`${id} contents links land on the chapter's first page`, landed)
    await page.locator(`#${id}`).screenshot({ path: path.join(EVIDENCE, `${id}.png`) })
  }
  const hebrewDir = await (await paginatedFrame(h, 'book-paginated-he')).evaluate(() => document.documentElement.getAttribute('dir'))
  check('the Hebrew paginated book root is right to left', hebrewDir === 'rtl', String(hebrewDir))
}
