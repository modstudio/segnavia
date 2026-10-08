// Renders pages, slides and decks to PDF or images in a headless Chromium the
// host names. A page renders at its own size; paper applies only when the
// page asks for it. Every render is offline: a request leaving the document
// is refused and the browser's own sockets go to a proxy that is not there,
// so a render cannot fetch, beacon or depend on the network. Everything a
// page shows (faces, images, styles) arrives inside it.

import { type Deck, Page, type PageInput, PX_PER_MM, sheetMm } from '@segnavia/format'
import { frameDocument, newNonce } from '@segnavia/frame/bridge'
import { type PrintOptions, printableDeck } from '@segnavia/frame/print-document'
import { PDFDocument } from 'pdf-lib'
import { type Browser, type BrowserContext, chromium, type Page as Tab } from 'playwright-core'

export const RENDER_BOUND_MS = 60_000
// How long a page that runs its own code gets to call window.pageReady().
export const PAGE_READY_BOUND_MS = 10_000
const FLUID_WIDTH = 1024

// Docker's small /dev/shm crashes Chromium mid-render rather than at launch.
export const CONTAINER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
const NO_NETWORK_ARGS = ['--proxy-server=socks5://127.0.0.1:9', '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp']

export class RendererUnavailableError extends Error {
  override name = 'RendererUnavailableError'
}
export class RenderTimeoutError extends Error {
  override name = 'RenderTimeoutError'
}
// A render that produced something the host's limits refuse, or a page that
// never said it was ready. The message names which.
export class RenderRefusedError extends Error {
  override name = 'RenderRefusedError'
}

export interface Font {
  family: string
  data: Uint8Array
  format: 'woff2' | 'woff' | 'truetype' | 'opentype'
  weight?: number | string
  style?: 'normal' | 'italic'
}

export interface RenderLimits {
  maxSheets?: number
  maxBytes?: number
}

export interface RenderOptions {
  // The host's house style and faces, applied to every document rendered.
  css?: string
  fonts?: Font[]
  limits?: RenderLimits
  boundMs?: number
  // A page running its own code is printed only once it calls
  // window.pageReady(); false prints it as soon as it loads.
  waitForPageReady?: boolean
  // Let the document's own @page size win over its print setting.
  preferCssPageSize?: boolean
  // Runs in the loaded page before it is printed or captured, for a host that
  // measures and lays out inside the browser (a scale that fits, a page count).
  beforeOutput?: (tab: Tab) => Promise<void>
}

export interface ImageOptions extends RenderOptions {
  format?: 'png' | 'jpeg' | 'webp'
  // Tried in order until the image fits `limits.maxBytes`.
  quality?: number[]
  scale?: number
  width?: number
}

export interface RendererOptions {
  executablePath: string
  args?: string[]
  // At most this many renders at once; the rest wait their turn.
  concurrency?: number
  // Caps each page's JavaScript heap, for hosts rendering code they did not write.
  jsHeapMb?: number
}

export interface Renderer {
  pagePdf(page: PageInput, options?: RenderOptions): Promise<Uint8Array>
  pageImage(page: PageInput, options?: ImageOptions): Promise<Uint8Array>
  deckPdf(deck: Deck, options?: RenderOptions & PrintOptions): Promise<Uint8Array>
  slideImage(deck: Deck, index: number, options?: ImageOptions & Pick<PrintOptions, 'inline'>): Promise<Uint8Array>
  close(): Promise<void>
}

export function fontFaces(fonts: Font[] = []): string {
  return fonts
    .map(
      (font) =>
        `@font-face{font-family:${JSON.stringify(font.family)};src:url(data:font/${font.format === 'truetype' ? 'ttf' : font.format === 'opentype' ? 'otf' : font.format};base64,${Buffer.from(font.data).toString('base64')}) format(${JSON.stringify(font.format)});font-weight:${font.weight ?? 'normal'};font-style:${font.style ?? 'normal'};font-display:block}`,
    )
    .join('')
}

async function withinBound<T>(ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const bound = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RenderTimeoutError(`The render did not finish within ${ms / 1000}s.`)), ms)
  })
  try {
    return await Promise.race([work, bound])
  } finally {
    clearTimeout(timer)
  }
}

async function sheets(pdf: Uint8Array): Promise<number> {
  return (await PDFDocument.load(pdf)).getPageCount()
}

async function enforce(pdf: Uint8Array, limits: RenderLimits | undefined): Promise<Uint8Array> {
  if (limits?.maxBytes !== undefined && pdf.byteLength > limits.maxBytes) {
    throw new RenderRefusedError(`The PDF is ${pdf.byteLength} bytes; the limit is ${limits.maxBytes}.`)
  }
  if (limits?.maxSheets !== undefined) {
    const count = await sheets(pdf)
    if (count > limits.maxSheets) throw new RenderRefusedError(`The PDF has ${count} sheets; the limit is ${limits.maxSheets}.`)
  }
  return pdf
}

// One image of what a tab shows. Shared with capture, so a shot and a
// rendered slide are encoded the same way under the same size ceiling.
export async function captureImage(tab: Tab, options: Pick<ImageOptions, 'format' | 'quality' | 'limits'>, fullPage: boolean): Promise<Uint8Array> {
  const format = options.format ?? 'png'
  if (format !== 'webp') {
    return tab.screenshot({ type: format, fullPage, ...(format === 'jpeg' ? { quality: options.quality?.[0] ?? 90 } : {}) })
  }
  // Playwright offers no WebP; Chromium's own capture does, at a quality.
  const session = await tab.context().newCDPSession(tab)
  try {
    const clip = await tab.evaluate((wholePage) => {
      const scale = devicePixelRatio
      if (wholePage) return { x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, scale }
      return { x: scrollX, y: scrollY, width: innerWidth, height: innerHeight, scale }
    }, fullPage)
    for (const quality of options.quality ?? [90, 80, 70]) {
      const { data } = await session.send('Page.captureScreenshot', {
        format: 'webp',
        quality,
        captureBeyondViewport: fullPage,
        clip,
      })
      const bytes = Buffer.from(data, 'base64')
      if (options.limits?.maxBytes === undefined || bytes.byteLength <= options.limits.maxBytes) return bytes
    }
  } finally {
    await session.detach()
  }
  throw new RenderRefusedError(`The image is larger than ${options.limits?.maxBytes} bytes at every quality tried.`)
}

// A page that grows takes the height of its content. The viewport is
// collapsed first, because a document is never shorter than its viewport.
async function contentHeight(tab: Tab): Promise<number> {
  const width = tab.viewportSize()?.width ?? FLUID_WIDTH
  await tab.setViewportSize({ width, height: 1 })
  const height = await tab.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0))
  await tab.setViewportSize({ width, height })
  return height
}

export async function openRenderer(options: RendererOptions): Promise<Renderer> {
  let browser: Browser
  try {
    browser = await chromium.launch({
      executablePath: options.executablePath,
      args: [...(options.args ?? []), ...NO_NETWORK_ARGS, ...(options.jsHeapMb ? [`--js-flags=--max-old-space-size=${options.jsHeapMb}`] : [])],
    })
  } catch (error) {
    throw new RendererUnavailableError(`Chromium at ${options.executablePath} could not start: ${(error as Error).message}`)
  }
  const limit = options.concurrency ?? 2
  let running = 0
  const waiting: Array<() => void> = []
  const acquire = (): Promise<void> => {
    if (running < limit) {
      running++
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => waiting.push(resolve))
  }
  const release = () => {
    const next = waiting.shift()
    if (next) next()
    else running--
  }

  async function withTab<T>(
    setup: {
      viewport: { width: number; height: number }
      scripts: boolean
      scale?: number
      html: string
      waitForReady: boolean
      boundMs?: number
      beforeOutput?: (tab: Tab) => Promise<void>
    },
    body: (tab: Tab) => Promise<T>,
  ): Promise<T> {
    await acquire()
    let context: BrowserContext | undefined
    try {
      return await withinBound(
        setup.boundMs ?? RENDER_BOUND_MS,
        (async () => {
          context = await browser.newContext({ viewport: setup.viewport, deviceScaleFactor: setup.scale ?? 1, javaScriptEnabled: setup.scripts, offline: true })
          await context.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort('blockedbyclient')))
          await context.routeWebSocket('**/*', (socket) => socket.close())
          const tab = await context.newPage()
          let ready: (() => void) | undefined
          const readyPromise = new Promise<void>((resolve) => {
            ready = resolve
          })
          if (setup.waitForReady) await tab.exposeFunction('pageReady', () => ready?.())
          await tab.setContent(setup.html, { waitUntil: 'load' })
          if (setup.waitForReady) {
            await withinBound(PAGE_READY_BOUND_MS, readyPromise).catch(() => {
              throw new RenderRefusedError(`The page did not call window.pageReady() within ${PAGE_READY_BOUND_MS / 1000}s.`)
            })
          }
          await tab.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {})
          await setup.beforeOutput?.(tab)
          return body(tab)
        })(),
      )
    } finally {
      await context?.close().catch(() => {})
      release()
    }
  }

  function pageDocument(page: Page, options: RenderOptions): string {
    const css = `${fontFaces(options.fonts)}${options.css ?? ''}`
    return frameDocument(page.html, { scripts: page.scripts, nonce: newNonce(), dir: page.dir, lang: page.lang, css, relayKeys: false, reportHeight: false })
  }

  function pageViewport(page: Page, width?: number) {
    if (page.print) {
      const mm = sheetMm(page.print)
      return { width: Math.round(mm.width * PX_PER_MM), height: Math.round(mm.height * PX_PER_MM) }
    }
    if (page.size === 'fluid') return { width: width ?? FLUID_WIDTH, height: 800 }
    return { width: page.size.width, height: page.size.height === 'auto' ? 800 : page.size.height }
  }

  const image = captureImage

  return {
    async pagePdf(input, opts = {}) {
      const page = Page.parse(input)
      const viewport = pageViewport(page)
      const pdf = await withTab(
        {
          viewport,
          scripts: page.scripts === 'sandboxed',
          html: pageDocument(page, opts),
          waitForReady: page.scripts === 'sandboxed' && opts.waitForPageReady !== false,
          boundMs: opts.boundMs,
          beforeOutput: opts.beforeOutput,
        },
        async (tab) => {
          if (page.print) {
            const mm = sheetMm(page.print)
            const margin = page.print.margin
            return tab.pdf({
              width: `${mm.width}mm`,
              height: `${mm.height}mm`,
              printBackground: true,
              preferCSSPageSize: opts.preferCssPageSize ?? false,
              margin: margin ? { top: `${margin.top}mm`, right: `${margin.right}mm`, bottom: `${margin.bottom}mm`, left: `${margin.left}mm` } : undefined,
            })
          }
          const fixedHeight = typeof page.size === 'object' && page.size.height !== 'auto' ? page.size.height : null
          const height = fixedHeight ?? (await contentHeight(tab))
          return tab.pdf({ width: `${viewport.width}px`, height: `${height}px`, printBackground: true, pageRanges: fixedHeight ? undefined : '1' })
        },
      )
      return enforce(pdf, opts.limits)
    },

    async pageImage(input, opts = {}) {
      const page = Page.parse(input)
      const viewport = pageViewport(page, opts.width)
      const grows = page.size === 'fluid' || (typeof page.size === 'object' && page.size.height === 'auto')
      return withTab(
        {
          viewport,
          scripts: page.scripts === 'sandboxed',
          scale: opts.scale,
          html: pageDocument(page, opts),
          waitForReady: page.scripts === 'sandboxed' && opts.waitForPageReady !== false,
          boundMs: opts.boundMs,
          beforeOutput: opts.beforeOutput,
        },
        async (tab) => {
          if (grows) await contentHeight(tab)
          return image(tab, opts, false)
        },
      )
    },

    async deckPdf(deck, opts = {}) {
      const css = `${fontFaces(opts.fonts)}${opts.css ?? ''}`
      const html = printableDeck(deck, { ...opts, css })
      const notes = opts.layout === 'notes'
      const viewport = notes
        ? pageViewport({ html: '', size: 'fluid', scripts: 'refuse', print: opts.notesPaper ?? { paper: 'letter', orientation: 'portrait' } })
        : deck.size
      const pdf = await withTab(
        { viewport, scripts: deck.scripts === 'sandboxed', html, waitForReady: false, boundMs: opts.boundMs, beforeOutput: opts.beforeOutput },
        (tab) => tab.pdf({ preferCSSPageSize: true, printBackground: true }),
      )
      return enforce(pdf, opts.limits)
    },

    async slideImage(deck, index, opts = {}) {
      const slide = deck.slides[index]
      if (!slide) throw new RangeError(`The deck has no slide ${index + 1}.`)
      const single: Deck = { ...deck, slides: [slide] }
      const css = `${fontFaces(opts.fonts)}${opts.css ?? ''}`
      const html = printableDeck(single, { inline: opts.inline, css })
      return withTab(
        {
          viewport: deck.size,
          scripts: deck.scripts === 'sandboxed',
          scale: opts.scale,
          html,
          waitForReady: false,
          boundMs: opts.boundMs,
          beforeOutput: opts.beforeOutput,
        },
        (tab) => image(tab, opts, false),
      )
    },

    close: () => browser.close(),
  }
}
