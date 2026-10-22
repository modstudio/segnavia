// Renders pages, slides and decks in a host-named, offline headless Chromium.

import { type BookInput, type Deck, type ImpositionInput, Page, type PageInput, printProperties } from '@segnavia/format'
import { frameDocument, newNonce } from '@segnavia/frame/bridge'
import { type PrintOptions, printableDeck } from '@segnavia/frame/print-document'
import type { PreparedSlots } from '@segnavia/html'
import { type Browser, type BrowserContext, chromium, type Page as Tab } from 'playwright-core'
import { renderBrowserBookPdf } from './book-render.ts'
import { browserJpegDecoder } from './browser-jpeg.ts'
import { renderDeckPdf } from './deck-pdf.ts'
import { RendererUnavailableError, RenderRefusedError } from './errors.ts'
import { fontFaces } from './font-faces.ts'
import type { ImageOptions, OverflowEntry, RenderOptions } from './options.ts'
import { measureOverflow, type PrintResult, printWithOverflow } from './overflow.ts'
import { containFixedPageOverflow } from './overflow-containment.ts'
import { assertPrintOptions, printCss, printPage, printViewport } from './page-paper.ts'
import type { PieceGeometry } from './pages-imposition.ts'
import { renderPagesPdf } from './pages-pdf.ts'
import { finishPdf } from './pdf-finish.ts'
import { type RenderDeadline, withinBound, withinRenderPermit } from './render-deadline.ts'
import { renderSlotCopyPdfs } from './slot-copies.ts'
import { filledDeck, filledPage, filledPages, preparedSlotsFor } from './slot-fill.ts'
import { installSlotFitCapture, mergeCapturedSlotFit } from './slot-fit.ts'

export type { EffectsReport } from './effects/types.ts'
export { RendererUnavailableError, RenderRefusedError } from './errors.ts'
export { fontFaces } from './font-faces.ts'
export type { Font, ImageOptions, OverflowContribution, OverflowEntry, OverflowPart, OverflowReport, RenderLimits, RenderOptions } from './options.ts'
export type { PressDestination, PressImage, PressReport } from './press/types.ts'
export { RenderTimeoutError } from './render-deadline.ts'

export const RENDER_BOUND_MS = 60_000
export const PAGE_READY_BOUND_MS = 10_000
const FLUID_WIDTH = 1024

export const CONTAINER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
const NO_NETWORK_ARGS = ['--proxy-server=socks5://127.0.0.1:9', '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp']

export interface RendererOptions {
  executablePath: string
  args?: string[]
  // At most this many renders at once; the rest wait their turn.
  concurrency?: number
  // Caps each page's JavaScript heap, for hosts rendering code they did not write.
  jsHeapMb?: number
}

export interface Renderer {
  bookPdf(book: BookInput, options?: RenderOptions): Promise<Uint8Array>
  pagePdf(page: PageInput, options?: RenderOptions): Promise<Uint8Array>
  pagesPdf(pages: PageInput[], options?: RenderOptions & { imposition?: ImpositionInput }): Promise<Uint8Array>
  pageImage(page: PageInput, options?: ImageOptions): Promise<Uint8Array>
  deckPdf(deck: Deck, options?: RenderOptions & PrintOptions): Promise<Uint8Array>
  slideImage(deck: Deck, index: number, options?: ImageOptions & Pick<PrintOptions, 'inline'>): Promise<Uint8Array>
  close(): Promise<void>
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
      deadline?: RenderDeadline
      beforeOutput?: (tab: Tab) => Promise<void>
      slots?: PreparedSlots
    },
    body: (tab: Tab) => Promise<T>,
  ): Promise<T> {
    let context: BrowserContext | undefined
    const measureSlots = setup.slots && setup.html.includes('data-slot-overflow') ? setup.slots : undefined
    try {
      return await withinBound(
        setup.deadline?.remaining() ?? setup.boundMs ?? RENDER_BOUND_MS,
        (async () => {
          context = await browser.newContext({ viewport: setup.viewport, deviceScaleFactor: setup.scale ?? 1, javaScriptEnabled: setup.scripts, offline: true })
          if (measureSlots) await installSlotFitCapture(context)
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
          if (measureSlots) await mergeCapturedSlotFit(tab, measureSlots, PAGE_READY_BOUND_MS)
          await setup.beforeOutput?.(tab)
          return body(tab)
        })(),
      )
    } finally {
      await context?.close().catch(() => {})
    }
  }
  function pageDocument(page: Page, options: RenderOptions, printing = false): string {
    const hostCss = `${page.print ? (printing ? printCss(page.print) : printProperties(page.print)) : ''}${fontFaces(options.fonts)}${options.css ?? ''}`
    const fixedSize = typeof page.size === 'object' && page.size.height !== 'auto'
    const css = printing && !page.print && fixedSize ? containFixedPageOverflow(hostCss) : hostCss
    return frameDocument(page.html, { scripts: page.scripts, nonce: newNonce(), dir: page.dir, lang: page.lang, css, relayKeys: false, reportHeight: false })
  }

  async function finishWithBrowser(
    pdf: Uint8Array,
    options: Pick<RenderOptions, 'effects' | 'limits' | 'press'>,
    deadline?: RenderDeadline,
  ): Promise<Uint8Array> {
    if (!options.press || (new TextDecoder().decode(options.press.profile.subarray(16, 20)) !== 'GRAY' && options.press.images !== 'convert'))
      return finishPdf(pdf, options)
    return withTab({ viewport: { width: 1, height: 1 }, scripts: true, html: '<!doctype html>', waitForReady: false, deadline }, (tab) =>
      finishPdf(pdf, options, browserJpegDecoder(tab)),
    )
  }
  function pageViewport(page: Page, width?: number, printing = false) {
    if (page.print) {
      return printViewport(page.print, printing)
    }
    if (page.size === 'fluid') return { width: width ?? FLUID_WIDTH, height: 800 }
    return { width: page.size.width, height: page.size.height === 'auto' ? 800 : page.size.height }
  }

  const image = captureImage

  async function renderPagePdf(page: Page, opts: RenderOptions, inputIndex?: number, deadline?: RenderDeadline): Promise<PrintResult<true>> {
    if (page.print) assertPrintOptions(page.print, opts.preferCssPageSize)
    const viewport = pageViewport(page, undefined, true)
    return withTab(
      {
        viewport,
        scripts: true,
        slots: preparedSlotsFor(page),
        html: pageDocument(page, opts, true),
        waitForReady: page.scripts === 'sandboxed' && opts.waitForPageReady !== false,
        boundMs: opts.boundMs,
        deadline,
        beforeOutput: opts.beforeOutput,
      },
      async (tab) => {
        if (page.print) return printPage(tab, page.print, opts.preferCssPageSize, inputIndex)
        const fixedHeight = typeof page.size === 'object' && page.size.height !== 'auto' ? page.size.height : null
        const height = fixedHeight ?? (await contentHeight(tab))
        if (fixedHeight !== null) {
          const overflow = await measureOverflow(tab, viewport.width, 'page', inputIndex)
          return { bytes: await tab.pdf({ width: `${viewport.width}px`, height: `${height}px`, printBackground: true }), overflow }
        }
        return printWithOverflow(
          tab,
          viewport.width,
          'page',
          { width: `${viewport.width}px`, height: `${height}px`, printBackground: true, pageRanges: '1' },
          inputIndex,
        )
      },
    )
  }

  async function renderPiecePdf(page: Page, geometry: PieceGeometry, css: string, opts: RenderOptions, deadline?: RenderDeadline): Promise<Uint8Array> {
    const html = frameDocument(page.html, {
      scripts: page.scripts,
      nonce: newNonce(),
      dir: page.dir,
      lang: page.lang,
      css: containFixedPageOverflow(css),
      relayKeys: false,
      reportHeight: false,
    })
    return withTab(
      {
        viewport: geometry.viewport,
        scripts: true,
        slots: preparedSlotsFor(page),
        html,
        waitForReady: page.scripts === 'sandboxed' && opts.waitForPageReady !== false,
        boundMs: opts.boundMs,
        deadline,
        beforeOutput: opts.beforeOutput,
      },
      (tab) =>
        tab.pdf({
          width: geometry.pdf.width,
          height: geometry.pdf.height,
          printBackground: true,
          preferCSSPageSize: false,
          pageRanges: '1',
          margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        }),
    )
  }

  const renderer: Renderer = {
    bookPdf(input, opts = {}) {
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, (deadline) => {
        return renderBrowserBookPdf(input, opts, {
          render: (setup, pdf, pageWidth, part) => withTab({ ...setup, deadline }, (tab) => printWithOverflow(tab, pageWidth, part, pdf)),
          fontFaces: (options) => fontFaces(options.fonts),
          finish: (pdf, options) => finishWithBrowser(pdf, options, deadline),
        })
      })
    },

    async pagePdf(input, opts = {}) {
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const overflows: OverflowEntry[] = []
        const bytes = await renderSlotCopyPdfs(opts.slots, async (copySlots) => {
          const page = await filledPage(Page.parse(input), copySlots, deadline.signal)
          const printed = await renderPagePdf(page, { ...opts, effects: false, limits: undefined, press: undefined, overflow: undefined }, undefined, deadline)
          if (printed.overflow) overflows.push(printed.overflow)
          return printed.bytes
        })
        const output = await finishWithBrowser(bytes, opts, deadline)
        if (overflows.length) opts.overflow?.report?.({ entries: overflows })
        return output
      })
    },

    async pageImage(input, opts = {}) {
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const page = await filledPage(Page.parse(input), opts.slots, deadline.signal)
        const viewport = pageViewport(page, opts.width)
        const grows = page.size === 'fluid' || (typeof page.size === 'object' && page.size.height === 'auto')
        return withTab(
          {
            viewport,
            scripts: true,
            slots: preparedSlotsFor(page),
            scale: opts.scale,
            html: pageDocument(page, opts),
            waitForReady: page.scripts === 'sandboxed' && opts.waitForPageReady !== false,
            boundMs: opts.boundMs,
            deadline,
            beforeOutput: opts.beforeOutput,
          },
          async (tab) => {
            if (grows) await contentHeight(tab)
            return image(tab, opts, false)
          },
        )
      })
    },

    async pagesPdf(inputs, opts = {}) {
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const parsed = inputs.map((input) => Page.parse(input))
        const bytes = await renderSlotCopyPdfs(opts.slots, async (copySlots) => {
          const pages = await filledPages(parsed, copySlots, deadline.signal)
          return renderPagesPdf(
            pages,
            { ...opts, effects: false, limits: undefined, press: undefined },
            {
              pagePdf: (page, options, inputIndex) => renderPagePdf(page, options, inputIndex, deadline),
              piecePdf: (page, geometry, css, options) => renderPiecePdf(page, geometry, css, options, deadline),
              fontFaces: (options) => fontFaces(options.fonts),
              finish: async (pdf) => pdf,
            },
          )
        })
        return finishWithBrowser(bytes, opts, deadline)
      })
    },

    async deckPdf(deck, opts = {}) {
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const bytes = await renderSlotCopyPdfs(opts.slots, async (copySlots) => {
          const prepared = await filledDeck(deck, copySlots, deadline.signal)
          return renderDeckPdf(
            prepared,
            { ...opts, effects: false, press: undefined },
            {
              renderPdf: (setup, pdf) => withTab({ ...setup, slots: preparedSlotsFor(prepared), waitForReady: false, deadline }, (tab) => tab.pdf(pdf)),
              fontFaces: (options) => fontFaces(options.fonts),
              finish: async (pdf) => pdf,
            },
          )
        })
        return finishWithBrowser(bytes, opts, deadline)
      })
    },

    async slideImage(deck, index, opts = {}) {
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const preparedDeck = await filledDeck(deck, opts.slots, deadline.signal)
        const slide = preparedDeck.slides[index]
        if (!slide) throw new RangeError(`The deck has no slide ${index + 1}.`)
        const single: Deck = { ...preparedDeck, slides: [slide] }
        const css = `${fontFaces(opts.fonts)}${opts.css ?? ''}`
        const html = printableDeck(single, { inline: opts.inline, css })
        return withTab(
          {
            viewport: deck.size,
            scripts: true,
            scale: opts.scale,
            html,
            slots: preparedSlotsFor(preparedDeck),
            waitForReady: false,
            boundMs: opts.boundMs,
            deadline,
            beforeOutput: opts.beforeOutput,
          },
          (tab) => image(tab, opts, false),
        )
      })
    },

    close: () => browser.close(),
  }
  return renderer
}
