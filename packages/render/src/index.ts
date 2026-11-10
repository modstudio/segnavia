import { Cover, pageOrPrintedFromDocument } from '@segnavia/format'
import { expandFrameBookValue } from '@segnavia/frame/motifs'
import { type EstablishedPageDay, fillPageAsOfBindings, isPrintedHtmlPage, type PreparedSlots, parseDocument, printedPageAuthorHtml } from '@segnavia/html'
import { type Browser, type BrowserContext, chromium, type Page as Tab } from 'playwright-core'
import { parseBookPdfOptions } from './book-options.ts'
import { renderBrowserBookPdf, renderBrowserBookPlan } from './book-render.ts'
import { resolveRenderBook, resolveRenderBrand, resolveRenderDeck } from './brand.ts'
import { raceBrowserDisconnect } from './browser-disconnect.ts'
import { browserJpegDecoder } from './browser-jpeg.ts'
import { keepBrowser } from './browser-keeper.ts'
import { type BrowserTabSetup, renderInBrowserTab } from './browser-tab.ts'
import { coverImagePlan } from './cover-image.ts'
import { renderDeckPdf } from './deck-pdf.ts'
import { resolveDiagramScript } from './diagram-script.ts'
import { withDocumentMetadata } from './document-metadata.ts'
import { pdfWithBackdropRasters, prepareBackdropRasters, tagBackdropRasters } from './effects/raster.ts'
import { launchUnavailable, relaunchUnavailable } from './errors.ts'
import { fontFaces } from './font-faces.ts'
import {
  copyLimits,
  enforceDeckLimits,
  innerLimits,
  type OverflowEntry,
  parseComposedRenderOptions,
  parseRenderOptions,
  type RenderOptions,
  refuseMultiCompositionProgress,
  refuseProgressWithoutComposition,
} from './options.ts'
import { printWithOverflow } from './overflow.ts'
import { resolveRenderDayContexts } from './page-as-of.ts'
import { expandRenderedPageValue, prepareRenderedPage, prepareRenderedPages, prepareRenderedPageValue, renderOptionsWithBookFonts } from './page-document.ts'
import { renderPreparedPageImage } from './page-image-render.ts'
import { renderPagePdf, renderPiecePdf } from './page-render.ts'
import { parsePagePdfOptions } from './page-render-options.ts'
import { renderPagesPdf } from './pages-pdf.ts'
import { enforce, finishPdf } from './pdf-finish.ts'
import { withPreflightSeed } from './preflight.ts'
import { proofRasterImage } from './proof-image.ts'
import { type RenderDeadline, withinBound, withinRenderPermit } from './render-deadline.ts'
import { renderFailure } from './render-failure.ts'
import { renderQueue } from './render-queue.ts'
import { renderReadiness } from './render-readiness.ts'
import { DEFAULT_JS_HEAP_MB, RENDER_BOUND_MS, type Renderer, type RendererOptions } from './renderer.ts'
import { renderSlideImage } from './slide-image.ts'
import { renderSlotCopyPdfs } from './slot-copies.ts'
import { slotsForDocument } from './slot-document.ts'
import { filledBook, filledDeck, filledPage, filledPages } from './slot-fill.ts'

export { FontRefusedError } from '@segnavia/frame/fonts'
export type { MotifsOptions } from '@segnavia/frame/motifs'
export type { PreparedSlots, ResolvedPlacement, ResolvePlacement } from '@segnavia/html'
export { captureImage } from './capture-image.ts'
export { COVER_IMAGE_OMITTED, type CoverImageOptions, type CoverImagePlan, coverImagePlan } from './cover-image.ts'
export type { EffectsReport } from './effects/types.ts'
export { RendererUnavailableError, RenderLimitError, RenderRefusedError } from './errors.ts'
export { fontFaces } from './font-faces.ts'
export type { LocalFontsOptions, LocalFontsReport } from './local-fonts.ts'
export type {
  AssetAnswer,
  Assets,
  Font,
  ImageOptions,
  MarksReport,
  OverflowContribution,
  OverflowEntry,
  OverflowPart,
  OverflowReport,
  PageImageOptions,
  ProofImageOptions,
  RenderOptions,
} from './options.ts'
export type { PressDestination, PressImage, PressReport } from './press/types.ts'
export { RenderTimeoutError } from './render-deadline.ts'
export {
  type BookPdfOptions,
  type BookPlanOptions,
  CONTAINER_ARGS,
  DEFAULT_JS_HEAP_MB,
  PAGE_READY_BOUND_MS,
  type PagePdfOptions,
  RENDER_BOUND_MS,
  type Renderer,
  type RendererOptions,
} from './renderer.ts'
export { filledBook }

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
  const renderer: Renderer = {
    async bookPdf(input, opts = {}) {
      const parsedOptions = parseBookPdfOptions(opts)
      return withinRenderPermit(parsedOptions.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const book = await resolveRenderBook(input, parsedOptions.newId, parsedOptions.brandSource, deadline.signal)
        const expanded = await expandFrameBookValue(
          book,
          parsedOptions.motifs,
          deadline.signal,
          parsedOptions.placements,
          'print',
          parsedOptions.pageWidths,
          parsedOptions.preflight?.profile,
        )
        const seededOptions = { ...parsedOptions, preflight: withPreflightSeed(parsedOptions.preflight, expanded.preflight) }
        const {
          options,
          fontCss: resolvedFontCss,
          fontFailures,
        } = await renderOptionsWithBookFonts(expanded.book, seededOptions, deadline.signal, expanded.fonts)
        return renderBrowserBookPdf(expanded.book, options, resolvedFontCss, {
          render: (setup, pdf, pageWidth, part) =>
            withTab({ ...setup, deadline }, async (tab) => {
              const captures = await prepareBackdropRasters(tab, options.effects)
              const printed = await printWithOverflow(tab, pageWidth, part, pdf)
              return { ...printed, bytes: await tagBackdropRasters(printed.bytes, captures) }
            }),
          fontFaces: (options) => fontFaces(options.fonts),
          finish: (pdf, options) => finishWithBrowser(pdf, options, deadline),
          fontFailures,
        })
      })
    },
    async bookPlan(input, opts = {}) {
      opts = parseRenderOptions(opts)
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const book = await resolveRenderBook(input, opts.newId, opts.brandSource, deadline.signal)
        const expanded = await expandFrameBookValue(book, opts.motifs, deadline.signal, opts.placements, 'print', opts.pageWidths)
        const { options, fontCss: resolvedFontCss, fontFailures } = await renderOptionsWithBookFonts(expanded.book, opts, deadline.signal, expanded.fonts)
        return renderBrowserBookPlan(expanded.book, { ...options, fontFailures }, `${resolvedFontCss}${fontFaces(options.fonts)}`, (setup, body) =>
          withTab({ ...setup, deadline }, body),
        )
      })
    },
    async pagePdf(input, opts = {}) {
      const parsedOptions = parsePagePdfOptions(opts ?? {})
      refuseMultiCompositionProgress(parsedOptions, 'pagePdf', (parsedOptions.slots?.fills?.length ?? 1) > 1)
      return withinRenderPermit(parsedOptions.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const overflows: OverflowEntry[] = []
        const prepared = await prepareRenderedPage(input, parsedOptions, parsedOptions.motifs, deadline.signal, 'print')
        const composesExactlyOneDocument = isPrintedHtmlPage(prepared.page) || prepared.page.printedPages !== undefined
        refuseProgressWithoutComposition(parsedOptions, composesExactlyOneDocument)
        const bytes = await renderSlotCopyPdfs(parsedOptions.slots, async (copySlots) => {
          const effectiveSlots = parsedOptions.slots?.fills ? copySlots : prepared.established.slots
          const pageWithDay = fillPageAsOfBindings(prepared.page, prepared.established.day)
          const { value: page, slots } = await filledPage(pageWithDay, effectiveSlots, deadline.signal)
          const diagramScript = await resolveDiagramScript(printedPageAuthorHtml(page))
          const printed = await renderPagePdf(
            page,
            slots,
            { ...prepared.options, limits: innerLimits(prepared.options.limits), press: undefined, overflow: undefined },
            { withTab },
            undefined,
            deadline,
            diagramScript,
            prepared.fontCss,
            prepared.fontFailures,
          )
          if (printed.overflow) overflows.push(printed.overflow)
          return printed.bytes
        })
        const output = await withDocumentMetadata(await finishWithBrowser(bytes, prepared.options, deadline), parsedOptions.metadata)
        if (overflows.length) parsedOptions.overflow?.report?.({ entries: overflows })
        return enforce(output, parsedOptions.limits)
      })
    },
    async pageImage(input, opts = {}) {
      const parsedOptions = parseComposedRenderOptions(opts)
      return withinRenderPermit(parsedOptions.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const prepared = await prepareRenderedPage(input, parsedOptions, parsedOptions.motifs, deadline.signal, 'screen')
        const composesExactlyOneDocument = isPrintedHtmlPage(prepared.page) || prepared.page.printedPages !== undefined
        refuseProgressWithoutComposition(parsedOptions, composesExactlyOneDocument)
        return renderPreparedPageImage(prepared, parsedOptions, deadline, withTab)
      })
    },

    async coverImage(input, opts) {
      const cover = Cover.parse(input)
      const plan = coverImagePlan(cover, opts)
      const options = parseComposedRenderOptions(plan.options)
      return await withinRenderPermit(options.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const contexts = await resolveRenderDayContexts([cover.page], options, deadline.signal)
        const established = contexts.pages[0] as EstablishedPageDay
        const prepared = await prepareRenderedPageValue(cover.page, options, options.motifs, deadline.signal, established, 'screen')
        const composesExactlyOneDocument = isPrintedHtmlPage(prepared.page) || prepared.page.printedPages !== undefined
        refuseProgressWithoutComposition(options, composesExactlyOneDocument)
        return renderPreparedPageImage(prepared, options, deadline, withTab)
      })
    },

    async pagesPdf(inputs, opts = {}) {
      const parsedOptions = parsePagePdfOptions(opts ?? {})
      refuseMultiCompositionProgress(parsedOptions, 'pagesPdf', true)
      return withinRenderPermit(parsedOptions.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const parsed = await Promise.all(
          inputs.map(async (input) => {
            const document = parseDocument(input, { newId: parsedOptions.newId })
            const brand = await resolveRenderBrand(document, parsedOptions.brandSource, deadline.signal)
            const page = pageOrPrintedFromDocument(document, brand)
            return page
          }),
        )
        const contexts = await resolveRenderDayContexts(parsed, parsedOptions, deadline.signal)
        const expanded = await Promise.all(
          parsed.map((page, index) => {
            const day = contexts.pages[index]?.day
            return expandRenderedPageValue(page, parsedOptions, deadline.signal, day, 'print')
          }),
        )
        const prepared = await prepareRenderedPages(expanded, parsedOptions, deadline.signal)
        const expandedPages = expanded.map((item, index) => fillPageAsOfBindings(item.page, contexts.pages[index]?.day))
        const bytes = await renderSlotCopyPdfs(parsedOptions.slots, async (copySlots) => {
          const effectiveSlots = parsedOptions.slots?.fills ? copySlots : contexts.pages[0]?.slots
          const { value: pages, slots, frameGroups } = await filledPages(expandedPages, effectiveSlots, deadline.signal)
          const diagramScript = await resolveDiagramScript(pages.map(printedPageAuthorHtml).join(''))
          return renderPagesPdf(
            pages,
            slots,
            { ...prepared.options, limits: innerLimits(prepared.options.limits), press: undefined },
            {
              pagePdf: (page, slots, options, inputIndex) =>
                renderPagePdf(
                  page,
                  slots,
                  { ...options, preflight: withPreflightSeed(options.preflight, expanded[inputIndex]?.preflight) },
                  { withTab },
                  inputIndex,
                  deadline,
                  diagramScript,
                  prepared.fontCss,
                  prepared.fontFailures,
                ),
              piecePdf: (page, slots, geometry, css, options) => renderPiecePdf(page, slots, geometry, css, options, { withTab }, deadline, diagramScript),
              fontFaces: (options) => `${prepared.fontCss}${fontFaces(options.fonts)}`,
              finish: async (pdf) => pdf,
            },
            frameGroups,
          )
        })
        return enforce(await withDocumentMetadata(await finishWithBrowser(bytes, parsedOptions, deadline), parsedOptions.metadata), parsedOptions.limits)
      })
    },

    async deckPdf(input, opts = {}) {
      opts = parseRenderOptions(opts)
      const composesExactlyOneDocument = false
      refuseProgressWithoutComposition(opts, composesExactlyOneDocument)
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const deck = await resolveRenderDeck(input, opts.newId, opts.brandSource, deadline.signal)
        enforceDeckLimits(deck, opts.limits)
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
                withTab(
                  {
                    ...setup,
                    slots: slotsForDocument(
                      slots,
                      frames.map((frame) => [frame]),
                    ),
                    readiness: renderReadiness('refuse', false, false),
                    deadline,
                  },
                  (tab) => pdfWithBackdropRasters(tab, pdf, opts.effects),
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
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const deck = await resolveRenderDeck(input, opts.newId, opts.brandSource, deadline.signal)
        enforceDeckLimits(deck, opts.limits)
        return renderSlideImage(deck, index, opts, { withTab, diagramScript: resolveDiagramScript }, deadline)
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
