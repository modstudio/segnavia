import { type Deck, Page } from '@segnavia/format'
import { frameDocument, newNonce } from '@segnavia/frame/bridge'
import { expandFramePages } from '@segnavia/frame/motifs'
import { printableDeck } from '@segnavia/frame/print-document'
import type { PreparedSlots } from '@segnavia/html'
import { type Browser, type BrowserContext, chromium, type Page as Tab } from 'playwright-core'
import { renderBrowserBookPdf } from './book-render.ts'
import { browserJpegDecoder } from './browser-jpeg.ts'
import { keepBrowser } from './browser-keeper.ts'
import { captureImage } from './capture-image.ts'
import { renderDeckPdf } from './deck-pdf.ts'
import { pdfWithBackdropRasters, prepareBackdropRasters, tagBackdropRasters } from './effects/raster.ts'
import { launchUnavailable, RenderRefusedError, relaunchUnavailable } from './errors.ts'
import { fontFaces } from './font-faces.ts'
import type { OverflowEntry, RenderOptions } from './options.ts'
import { measureOverflow, type PrintResult, printWithOverflow } from './overflow.ts'
import { containFixedPageOverflow } from './overflow-containment.ts'
import { prepareRenderedPage, prepareRenderedPages, renderOptionsWithBookFonts } from './page-document.ts'
import { assertPrintOptions, printPage, printViewport } from './page-paper.ts'
import type { PieceGeometry } from './pages-imposition.ts'
import { renderPagesPdf } from './pages-pdf.ts'
import { finishPdf } from './pdf-finish.ts'
import { awaitPrintedPageComposition, renderedPageDocument } from './printed-page-render.ts'
import { proofCapturedImage, proofCaptureOptions, proofRasterImage } from './proof-image.ts'
import { type RenderDeadline, withinBound, withinRenderPermit } from './render-deadline.ts'
import { renderFailure } from './render-failure.ts'
import { renderQueue } from './render-queue.ts'
import { DEFAULT_JS_HEAP_MB, PAGE_READY_BOUND_MS, RENDER_BOUND_MS, type Renderer, type RendererOptions } from './renderer.ts'
import { renderSlotCopyPdfs } from './slot-copies.ts'
import { filledBook, filledDeck, filledPage, filledPages, preparedSlotsFor } from './slot-fill.ts'
import { installSlotFitCapture, mergeCapturedSlotFit } from './slot-fit.ts'

export { FontRefusedError } from '@segnavia/frame/fonts'
export type { MotifsOptions } from '@segnavia/frame/motifs'
export { captureImage } from './capture-image.ts'
export type { EffectsReport } from './effects/types.ts'
export { RendererUnavailableError, RenderRefusedError } from './errors.ts'
export { fontFaces } from './font-faces.ts'
export type { LocalFontsOptions, LocalFontsReport } from './local-fonts.ts'
export type {
  Font,
  ImageOptions,
  MarksReport,
  OverflowContribution,
  OverflowEntry,
  OverflowPart,
  OverflowReport,
  ProofImageOptions,
  RenderLimits,
  RenderOptions,
} from './options.ts'
export type { PressDestination, PressImage, PressReport } from './press/types.ts'
export { RenderTimeoutError } from './render-deadline.ts'
export {
  CONTAINER_ARGS,
  DEFAULT_JS_HEAP_MB,
  PAGE_READY_BOUND_MS,
  type PagePdfOptions,
  RENDER_BOUND_MS,
  type Renderer,
  type RendererOptions,
} from './renderer.ts'
export { filledBook }

const FLUID_WIDTH = 1024
const NO_NETWORK_ARGS = ['--proxy-server=socks5://127.0.0.1:9', '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp']

// Collapse the viewport because a growing document is never shorter than it.
async function contentHeight(tab: Tab): Promise<number> {
  const width = tab.viewportSize()?.width ?? FLUID_WIDTH
  await tab.setViewportSize({ width, height: 1 })
  const height = await tab.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0))
  await tab.setViewportSize({ width, height })
  return height
}

export async function openRenderer(options: RendererOptions): Promise<Renderer> {
  const heapMb = options.jsHeapMb ?? DEFAULT_JS_HEAP_MB
  const keeper = keepBrowser(() =>
    chromium.launch({
      executablePath: options.executablePath,
      args: [...(options.args ?? []), ...NO_NETWORK_ARGS, `--js-flags=--max-old-space-size=${heapMb}`],
    }),
  )
  try {
    await keeper.browser()
  } catch (error) {
    throw launchUnavailable(options.executablePath, error)
  }
  let closed = false
  const queue = renderQueue(options.concurrency ?? 2)
  const { acquire, release } = queue

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
    let instance: Browser | undefined
    let crashed = false
    let settled = false
    const measureSlots = setup.slots && setup.html.includes('data-slot-overflow') ? setup.slots : undefined
    try {
      return await withinBound(
        setup.deadline?.remaining() ?? setup.boundMs ?? RENDER_BOUND_MS,
        (async () => {
          const browser = await keeper.browser().catch((error) => Promise.reject(relaunchUnavailable(options.executablePath, error)))
          instance = browser
          context = await browser.newContext({ viewport: setup.viewport, deviceScaleFactor: setup.scale ?? 1, javaScriptEnabled: setup.scripts, offline: true })
          if (settled) {
            await context.close().catch(() => {})
            return undefined as T
          }
          if (measureSlots) await installSlotFitCapture(context)
          await context.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort('blockedbyclient')))
          await context.routeWebSocket('**/*', (socket) => socket.close())
          const tab = await context.newPage()
          tab.on('crash', () => {
            crashed = true
          })
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
    } catch (error) {
      throw renderFailure({ crashed, disconnected: instance ? !instance.isConnected() : false, closed, heapMb }, error)
    } finally {
      settled = true
      await context?.close().catch(() => {})
    }
  }
  async function finishWithBrowser(
    pdf: Uint8Array,
    options: Pick<RenderOptions, 'effects' | 'limits' | 'press'>,
    deadline?: RenderDeadline,
  ): Promise<Uint8Array> {
    if (!options.press) return finishPdf(pdf, options)
    return withTab({ viewport: { width: 1, height: 1 }, scripts: true, html: '<!doctype html>', waitForReady: false, deadline }, (tab) =>
      finishPdf(pdf, options, browserJpegDecoder(tab)),
    )
  }
  function pageViewport(page: Page, width?: number) {
    if (page.print) {
      return printViewport(page.print)
    }
    if (page.size === 'fluid') return { width: width ?? FLUID_WIDTH, height: 800 }
    return { width: page.size.width, height: page.size.height === 'auto' ? 800 : page.size.height }
  }

  async function renderPagePdf(page: Page, opts: RenderOptions, inputIndex?: number, deadline?: RenderDeadline): Promise<PrintResult<true>> {
    if (page.print) assertPrintOptions(page.print, opts.preferCssPageSize)
    const viewport = pageViewport(page)
    return withTab(
      {
        viewport,
        scripts: true,
        slots: preparedSlotsFor(page),
        html: renderedPageDocument(page, opts, true),
        waitForReady: page.scripts === 'sandboxed' && opts.waitForPageReady !== false,
        boundMs: opts.boundMs,
        deadline,
        beforeOutput: opts.beforeOutput,
      },
      async (tab) => {
        await awaitPrintedPageComposition(tab, page)
        const captures = await prepareBackdropRasters(tab, opts.effects)
        if (page.print) {
          const printed = await printPage(tab, page.print, opts.preferCssPageSize, inputIndex)
          return { ...printed, bytes: await tagBackdropRasters(printed.bytes, captures) }
        }
        const fixedHeight = typeof page.size === 'object' && page.size.height !== 'auto' ? page.size.height : null
        const height = fixedHeight ?? (await contentHeight(tab))
        if (fixedHeight !== null) {
          const overflow = await measureOverflow(tab, viewport.width, 'page', inputIndex)
          return {
            bytes: await tagBackdropRasters(await tab.pdf({ width: `${viewport.width}px`, height: `${height}px`, printBackground: true }), captures),
            overflow,
          }
        }
        const printed = await printWithOverflow(
          tab,
          viewport.width,
          'page',
          { width: `${viewport.width}px`, height: `${height}px`, printBackground: true, pageRanges: '1' },
          inputIndex,
        )
        return { ...printed, bytes: await tagBackdropRasters(printed.bytes, captures) }
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
        pdfWithBackdropRasters(
          tab,
          {
            width: geometry.pdf.width,
            height: geometry.pdf.height,
            printBackground: true,
            preferCSSPageSize: false,
            pageRanges: '1',
            margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
          },
          opts.effects,
        ),
    )
  }

  const renderer: Renderer = {
    bookPdf(input, opts = {}) {
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        return renderBrowserBookPdf(input, await renderOptionsWithBookFonts(input, opts, deadline.signal), {
          render: (setup, pdf, pageWidth, part) =>
            withTab({ ...setup, deadline }, async (tab) => {
              const captures = await prepareBackdropRasters(tab, opts.effects)
              const printed = await printWithOverflow(tab, pageWidth, part, pdf)
              return { ...printed, bytes: await tagBackdropRasters(printed.bytes, captures) }
            }),
          fontFaces: (options) => fontFaces(options.fonts),
          finish: (pdf, options) => finishWithBrowser(pdf, options, deadline),
        })
      })
    },

    async pagePdf(input, opts = {}) {
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const overflows: OverflowEntry[] = []
        const prepared = await prepareRenderedPage(input, opts, opts.motifs, deadline.signal)
        const bytes = await renderSlotCopyPdfs(opts.slots, async (copySlots) => {
          const page = await filledPage(prepared.page, copySlots, deadline.signal)
          const printed = await renderPagePdf(page, { ...prepared.options, limits: undefined, press: undefined, overflow: undefined }, undefined, deadline)
          if (printed.overflow) overflows.push(printed.overflow)
          return printed.bytes
        })
        const output = await finishWithBrowser(bytes, prepared.options, deadline)
        if (overflows.length) opts.overflow?.report?.({ entries: overflows })
        return output
      })
    },

    async pageImage(input, opts = {}) {
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const prepared = await prepareRenderedPage(input, opts, opts.motifs, deadline.signal)
        const page = await filledPage(prepared.page, opts.slots, deadline.signal)
        const viewport = pageViewport(page, opts.width)
        const grows = page.size === 'fluid' || (typeof page.size === 'object' && page.size.height === 'auto')
        return withTab(
          {
            viewport,
            scripts: true,
            slots: preparedSlotsFor(page),
            scale: opts.scale,
            html: renderedPageDocument(page, prepared.options),
            waitForReady: page.scripts === 'sandboxed' && opts.waitForPageReady !== false,
            boundMs: opts.boundMs,
            deadline,
            beforeOutput: opts.beforeOutput,
          },
          async (tab) => {
            await awaitPrintedPageComposition(tab, page)
            if (grows) await contentHeight(tab)
            return proofCapturedImage(tab, await captureImage(tab, proofCaptureOptions(prepared.options), false), prepared.options)
          },
        )
      })
    },

    async pagesPdf(inputs, opts = {}) {
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const expanded = await expandFramePages(
          inputs.map((input) => Page.parse(input)),
          opts.motifs,
          deadline.signal,
        )
        const withFonts = await prepareRenderedPages(expanded, opts, deadline.signal)
        const parsed = expanded.map((item) => item.page)
        const bytes = await renderSlotCopyPdfs(opts.slots, async (copySlots) => {
          const pages = await filledPages(parsed, copySlots, deadline.signal)
          return renderPagesPdf(
            pages,
            { ...withFonts, limits: undefined, press: undefined },
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
            { ...opts, press: undefined },
            {
              renderPdf: (setup, pdf) =>
                withTab({ ...setup, slots: preparedSlotsFor(prepared), waitForReady: false, deadline }, (tab) =>
                  pdfWithBackdropRasters(tab, pdf, opts.effects),
                ),
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
          async (tab) => proofCapturedImage(tab, await captureImage(tab, proofCaptureOptions(opts), false), opts),
        )
      })
    },

    proofImage(input, opts) {
      return withinRenderPermit(RENDER_BOUND_MS, acquire, release, (deadline) =>
        withTab({ viewport: { width: 1, height: 1 }, scripts: true, html: '<!doctype html>', waitForReady: false, deadline }, (tab) =>
          proofRasterImage(tab, input, opts),
        ),
      )
    },

    async close() {
      closed = true
      queue.close()
      await keeper.close()
    },
  }
  return renderer
}
