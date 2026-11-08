import { bookFromDocument, Cover, type Deck, DocumentMetadata, deckFromDocument } from '@segnavia/format'
import { hasDiagram } from '@segnavia/frame/diagrams'
import { expandFrameBookValue, expandFramePages } from '@segnavia/frame/motifs'
import { printableDeckValue, resolveDeckMedia } from '@segnavia/frame/print-document'
import { type PreparedSlots, pageOrPrintedFromInput, parseDocument, resolvePageHtml } from '@segnavia/html'
import { type Browser, type BrowserContext, chromium, type Page as Tab } from 'playwright-core'
import { renderBrowserBookPdf } from './book-render.ts'
import { raceBrowserDisconnect } from './browser-disconnect.ts'
import { browserJpegDecoder } from './browser-jpeg.ts'
import { keepBrowser } from './browser-keeper.ts'
import { type BrowserTabSetup, renderInBrowserTab } from './browser-tab.ts'
import { captureImage } from './capture-image.ts'
import { coverImagePlan } from './cover-image.ts'
import { renderDeckPdf } from './deck-pdf.ts'
import { resolveDiagramScript } from './diagram-script.ts'
import { withDocumentMetadata } from './document-metadata.ts'
import { pdfWithBackdropRasters, prepareBackdropRasters, tagBackdropRasters } from './effects/raster.ts'
import { launchUnavailable, relaunchUnavailable } from './errors.ts'
import { fontFaces } from './font-faces.ts'
import {
  copyLimits,
  dependencySetup,
  enforceDeckLimits,
  type ImageOptions,
  innerLimits,
  type OverflowEntry,
  parseRenderOptions,
  type RenderOptions,
} from './options.ts'
import { printWithOverflow } from './overflow.ts'
import { prepareRenderedPage, prepareRenderedPages, prepareRenderedPageValue, renderOptionsWithBookFonts } from './page-document.ts'
import { renderPagePdf, renderPiecePdf } from './page-render.ts'
import { contentHeight, pageViewport } from './page-viewport.ts'
import { renderPagesPdf } from './pages-pdf.ts'
import { enforce, finishPdf } from './pdf-finish.ts'
import { awaitPrintedPageComposition, renderedPageDocument } from './printed-page-render.ts'
import { proofCapturedImage, proofCaptureOptions, proofRasterImage } from './proof-image.ts'
import { type RenderDeadline, withinBound, withinRenderPermit } from './render-deadline.ts'
import { renderFailure } from './render-failure.ts'
import { renderQueue } from './render-queue.ts'
import { renderReadiness, waitForDiagramReadiness } from './render-readiness.ts'
import { DEFAULT_JS_HEAP_MB, type PagePdfOptions, RENDER_BOUND_MS, type Renderer, type RendererOptions } from './renderer.ts'
import { renderSlotCopyPdfs } from './slot-copies.ts'
import { filledBook, filledDeck, filledPage, filledPages } from './slot-fill.ts'

export { FontRefusedError } from '@segnavia/frame/fonts'
export type { MotifsOptions } from '@segnavia/frame/motifs'
export type { PreparedSlots, ResolvedPlacement, ResolvePlacement } from '@segnavia/html'
export { captureImage } from './capture-image.ts'
export { COVER_IMAGE_OMITTED, type CoverImageOptions, type CoverImagePlan, coverImagePlan } from './cover-image.ts'
export type { EffectsReport } from './effects/types.ts'
export { RendererUnavailableError, RenderRefusedError } from './errors.ts'
export { fontFaces } from './font-faces.ts'
export type { LocalFontsOptions, LocalFontsReport } from './local-fonts.ts'
export type {
  DependencyAnswer,
  DependencyCache,
  Font,
  ImageOptions,
  MarksReport,
  OverflowContribution,
  OverflowEntry,
  OverflowPart,
  OverflowReport,
  ProofImageOptions,
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

function parsePagePdfOptions(options: PagePdfOptions): PagePdfOptions {
  const parsed = parseRenderOptions(options)
  return parsed.metadata === undefined ? parsed : { ...parsed, metadata: DocumentMetadata.parse(parsed.metadata) }
}

function slotsForFrames(slots: PreparedSlots, frames: readonly number[]): PreparedSlots {
  const marked = new Map<string, number>()
  for (const index of frames) {
    for (const [key, count] of slots.frames[index] ?? []) marked.set(key, (marked.get(key) ?? 0) + count)
  }
  return { ...slots, marked }
}

const NO_NETWORK_ARGS = ['--proxy-server=socks5://127.0.0.1:9', '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp']

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
    setup: BrowserTabSetup & {
      boundMs?: number
      deadline?: RenderDeadline
      slots?: PreparedSlots
    },
    body: (tab: Tab) => Promise<T>,
  ): Promise<T> {
    let context: BrowserContext | undefined
    let instance: Browser | undefined
    let crashed = false
    let settled = false
    let stopWatchingBrowser: (() => void) | undefined
    const measureSlots = setup.slots && setup.slots.marked.size > 0 ? setup.slots : undefined
    try {
      return await withinBound(
        setup.deadline?.remaining() ?? setup.boundMs ?? RENDER_BOUND_MS,
        (async () => {
          const browser = await keeper.browser().catch((error) => Promise.reject(relaunchUnavailable(options.executablePath, error)))
          instance = browser
          return await raceBrowserDisconnect(
            browser,
            settled,
            (stop) => {
              stopWatchingBrowser = stop
            },
            () =>
              renderInBrowserTab(
                browser,
                setup,
                measureSlots,
                {
                  settled: () => settled,
                  opened: (opened) => {
                    context = opened
                  },
                  crashed: () => {
                    crashed = true
                  },
                },
                body,
              ),
          )
        })(),
      )
    } catch (error) {
      throw renderFailure({ crashed, disconnected: instance ? !instance.isConnected() : false, closed, heapMb }, error)
    } finally {
      settled = true
      stopWatchingBrowser?.()
      await context?.close().catch(() => {})
    }
  }
  async function finishWithBrowser(
    pdf: Uint8Array,
    options: Pick<RenderOptions, 'effects' | 'limits' | 'press'>,
    deadline?: RenderDeadline,
  ): Promise<Uint8Array> {
    if (!options.press) return finishPdf(pdf, options)
    return withTab(
      { viewport: { width: 1, height: 1 }, scripts: true, html: '<!doctype html>', readiness: renderReadiness('refuse', false, false), deadline },
      (tab) => finishPdf(pdf, options, browserJpegDecoder(tab)),
    )
  }
  async function renderPreparedPageImage(
    prepared: Awaited<ReturnType<typeof prepareRenderedPage>>,
    opts: ImageOptions,
    deadline: RenderDeadline,
  ): Promise<Uint8Array> {
    const { value: page, slots } = await filledPage(prepared.page, opts.slots, deadline.signal)
    const diagramScript = await resolveDiagramScript(page.html)
    const { grows, ...viewport } = pageViewport(page, opts.width, opts.pageWidths)
    return withTab(
      {
        viewport,
        scripts: true,
        slots,
        scale: opts.scale,
        html: renderedPageDocument(page, prepared.options, false, diagramScript, prepared.fontCss),
        readiness: renderReadiness(page.scripts, hasDiagram(page.html), opts.waitForPageReady !== false),
        boundMs: opts.boundMs,
        deadline,
        beforeOutput: opts.beforeOutput,
        ...dependencySetup(opts),
      },
      async (tab) => {
        await awaitPrintedPageComposition(tab, page)
        if (grows) await contentHeight(tab)
        return proofCapturedImage(tab, await captureImage(tab, proofCaptureOptions(prepared.options), false), prepared.options)
      },
    )
  }
  const renderer: Renderer = {
    async bookPdf(input, opts = {}) {
      opts = parseRenderOptions(opts)
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const document = parseDocument(input, { newId: opts.newId })
        const expanded = await expandFrameBookValue(bookFromDocument(document), opts.motifs, deadline.signal, opts.placements, 'print', opts.pageWidths)
        const { options, fontCss: resolvedFontCss } = await renderOptionsWithBookFonts(expanded.book, opts, deadline.signal, expanded.fonts)
        return renderBrowserBookPdf(expanded.book, options, resolvedFontCss, {
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
      opts = parsePagePdfOptions(opts ?? {})
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const overflows: OverflowEntry[] = []
        const prepared = await prepareRenderedPage(input, opts, opts.motifs, deadline.signal, 'print')
        const bytes = await renderSlotCopyPdfs(opts.slots, async (copySlots) => {
          const { value: page, slots } = await filledPage(prepared.page, copySlots, deadline.signal)
          const diagramScript = await resolveDiagramScript(page.html)
          const printed = await renderPagePdf(
            page,
            slots,
            { ...prepared.options, limits: innerLimits(prepared.options.limits), press: undefined, overflow: undefined },
            { withTab },
            undefined,
            deadline,
            diagramScript,
            prepared.fontCss,
          )
          if (printed.overflow) overflows.push(printed.overflow)
          return printed.bytes
        })
        const output = await withDocumentMetadata(await finishWithBrowser(bytes, prepared.options, deadline), opts.metadata)
        if (overflows.length) opts.overflow?.report?.({ entries: overflows })
        return enforce(output, opts.limits)
      })
    },

    async pageImage(input, opts = {}) {
      opts = parseRenderOptions(opts)
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const prepared = await prepareRenderedPage(input, opts, opts.motifs, deadline.signal, 'screen')
        return renderPreparedPageImage(prepared, opts, deadline)
      })
    },

    coverImage(input, opts) {
      const cover = Cover.parse(input)
      const plan = coverImagePlan(cover, opts)
      const options = parseRenderOptions(plan.options)
      return withinRenderPermit(options.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const prepared = await prepareRenderedPageValue(cover.page, options, options.motifs, deadline.signal, 'screen')
        return renderPreparedPageImage(prepared, options, deadline)
      })
    },

    async pagesPdf(inputs, opts = {}) {
      opts = parsePagePdfOptions(opts ?? {})
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const expanded = await expandFramePages(
          inputs.map((input) => resolvePageHtml(pageOrPrintedFromInput(input, { newId: opts.newId }))),
          opts.motifs,
          deadline.signal,
          opts.placements,
          'print',
          opts.pageWidths,
        )
        const prepared = await prepareRenderedPages(expanded, opts, deadline.signal)
        const parsed = expanded.map((item) => item.page)
        const bytes = await renderSlotCopyPdfs(opts.slots, async (copySlots) => {
          const { value: pages, slots } = await filledPages(parsed, copySlots, deadline.signal)
          const diagramScript = await resolveDiagramScript(pages.map((page) => page.html).join(''))
          return renderPagesPdf(
            pages,
            slots,
            { ...prepared.options, limits: innerLimits(prepared.options.limits), press: undefined },
            {
              pagePdf: (page, slots, options, inputIndex) =>
                renderPagePdf(page, slots, options, { withTab }, inputIndex, deadline, diagramScript, prepared.fontCss),
              piecePdf: (page, slots, geometry, css, options) => renderPiecePdf(page, slots, geometry, css, options, { withTab }, deadline, diagramScript),
              fontFaces: (options) => `${prepared.fontCss}${fontFaces(options.fonts)}`,
              finish: async (pdf) => pdf,
            },
          )
        })
        return enforce(await withDocumentMetadata(await finishWithBrowser(bytes, opts, deadline), opts.metadata), opts.limits)
      })
    },

    async deckPdf(input, opts = {}) {
      opts = parseRenderOptions(opts)
      const deck = deckFromDocument(parseDocument(input, { newId: opts.newId }))
      enforceDeckLimits(deck, opts.limits)
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const bytes = await renderSlotCopyPdfs(opts.slots, async (copySlots) => {
          const { value: prepared, slots } = await filledDeck(deck, copySlots, deadline.signal)
          const diagramScript = await resolveDiagramScript(
            prepared.slides.map((slide) => ('kind' in slide.content && slide.content.kind === 'html' ? slide.content.html : '')).join(''),
          )
          return renderDeckPdf(
            prepared,
            { ...opts, limits: copyLimits(opts.limits, opts.slots), press: undefined },
            {
              renderPdf: (setup, pdf, frames) =>
                withTab({ ...setup, slots: slotsForFrames(slots, frames), readiness: renderReadiness('refuse', false, false), deadline }, (tab) =>
                  pdfWithBackdropRasters(tab, pdf, opts.effects),
                ),
              fontFaces: (options) => fontFaces(options.fonts),
              finish: async (pdf) => pdf,
              signal: deadline.signal,
            },
            diagramScript,
          )
        })
        return finishWithBrowser(bytes, opts, deadline)
      })
    },

    async slideImage(input, index, opts = {}) {
      opts = parseRenderOptions(opts)
      const deck = deckFromDocument(parseDocument(input, { newId: opts.newId }))
      enforceDeckLimits(deck, opts.limits)
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const { value: filled, slots } = await filledDeck(deck, opts.slots, deadline.signal)
        const preparedDeck = await resolveDeckMedia(filled, opts.placements, 'print', deadline.signal)
        const slide = preparedDeck.slides[index]
        if (!slide) throw new RangeError(`The deck has no slide ${index + 1}.`)
        const single: Deck = { ...preparedDeck, slides: [slide] }
        const slideHtml = 'kind' in slide.content && slide.content.kind === 'html' ? slide.content.html : ''
        const diagramScript = await resolveDiagramScript(slideHtml)
        const diagramReadiness = renderReadiness('refuse', hasDiagram(slideHtml), opts.waitForPageReady !== false)
        const css = `${fontFaces(opts.fonts)}${opts.css ?? ''}`
        const html = printableDeckValue(single, { inline: opts.inline, css, dependencyOrigins: opts.dependencyOrigins, diagramScript })
        return withTab(
          {
            viewport: deck.size,
            scripts: true,
            scale: opts.scale,
            html,
            slots: slotsForFrames(slots, [index]),
            readiness: renderReadiness('refuse', false, false),
            boundMs: opts.boundMs,
            deadline,
            beforeOutput: opts.beforeOutput,
            ...dependencySetup(opts),
          },
          async (tab) => {
            await waitForDiagramReadiness(tab.locator('iframe').contentFrame(), diagramReadiness)
            return proofCapturedImage(tab, await captureImage(tab, proofCaptureOptions(opts), false), opts)
          },
        )
      })
    },

    proofImage(input, opts) {
      return withinRenderPermit(RENDER_BOUND_MS, acquire, release, (deadline) =>
        withTab(
          { viewport: { width: 1, height: 1 }, scripts: true, html: '<!doctype html>', readiness: renderReadiness('refuse', false, false), deadline },
          (tab) => proofRasterImage(tab, input, opts),
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
