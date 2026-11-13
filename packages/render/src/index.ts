import { Cover, type OutlineSource, pageOrPrintedFromDocument } from '@segnavia/format'
import {
  documentOutlineSource,
  fillPageAsOfBindings,
  isPrintedHtmlPage,
  type PreparedSlots,
  parseDocument,
  printedPageAuthorHtml,
  printedPageDirection,
} from '@segnavia/html'
import { type Browser, type BrowserContext, chromium, type Page as Tab } from 'playwright-core'
import { namedDestinations } from './book-destinations.ts'
import { prepareRenderBook } from './book-expansion.ts'
import { parseBookPdfOptions, parseBookPlanOptions } from './book-options.ts'
import { renderBrowserBookPdf, renderBrowserBookPlan } from './book-render.ts'
import { writeDocumentStructure } from './book-structure.ts'
import { resolveRenderBrand, resolveRenderDeck } from './brand.ts'
import { raceBrowserDisconnect } from './browser-disconnect.ts'
import { keepBrowser } from './browser-keeper.ts'
import { type BrowserTabSetup, renderInBrowserTab } from './browser-tab.ts'
import { coverImagePlan } from './cover-image.ts'
import { renderDeckPdf } from './deck-pdf.ts'
import { withDocumentMetadata } from './document-metadata.ts'
import { pdfWithBackdropRasters, prepareBackdropRasters, tagBackdropRasters } from './effects/raster.ts'
import { parseCoverImageOptions, parseDeckPdfOptions, parsePageImageOptions, parseProofImageOptions, parseSlideImageOptions } from './entry-options.ts'
import { launchUnavailable, relaunchUnavailable } from './errors.ts'
import { fontFaces } from './font-faces.ts'
import {
  copyLimits,
  enforceDeckLimits,
  innerLimits,
  type OverflowEntry,
  pageCompositionCount,
  parseImageRenderOptions,
  refuseProgressUnlessOneComposition,
} from './options.ts'
import { outputDate } from './output-date.ts'
import { printWithOverflow } from './overflow.ts'
import { resolveRenderDayContext, resolveRenderDayContexts } from './page-as-of.ts'
import { expandRenderedPageValue, prepareRenderedPage, prepareRenderedPages, prepareRenderedPageValue } from './page-document.ts'
import { renderPreparedPageImage } from './page-image-render.ts'
import { renderPagePdf, renderPiecePdf } from './page-render.ts'
import { parsePagePdfOptions } from './page-render-options.ts'
import { renderPagesPdf } from './pages-pdf.ts'
import { enforce } from './pdf-finish.ts'
import { loadPdf } from './pdf-load.ts'
import { finishPdfWithBrowser } from './pdf-output.ts'
import { pagesTagged } from './pdf-tagging.ts'
import { surfacePreflight, withPreflightSeed } from './preflight.ts'
import { proofRasterImage } from './proof-image.ts'
import { createProtectPdf } from './protect-pdf.ts'
import { type RenderDeadline, withinBound, withinRenderPermit } from './render-deadline.ts'
import { renderFailure } from './render-failure.ts'
import { resolveRenderLayoutScripts } from './render-layout-scripts.ts'
import { renderQueue } from './render-queue.ts'
import { renderReadiness } from './render-readiness.ts'
import { DEFAULT_JS_HEAP_MB, RENDER_BOUND_MS, type Renderer, type RendererOptions } from './renderer.ts'
import { renderSlideImage } from './slide-image.ts'
import { effectiveCopySlots, renderSlotCopyPdfs } from './slot-copies.ts'
import { slotsForDocument } from './slot-document.ts'
import { fillDeckForDay, filledPage, filledPages } from './slot-fill.ts'
import { watermarkCopyStamper, watermarkPartFromFacts } from './watermark-stamp.ts'

export * from './public.ts'

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
  const protectPdf = createProtectPdf()
  const addOutline = async (bytes: Uint8Array, source: OutlineSource | undefined): Promise<Uint8Array> => {
    if (!source) return bytes
    const document = await loadPdf(bytes)
    writeDocumentStructure(document, { source, destinations: namedDestinations(document) })
    return document.save()
  }

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
  const finishWithBrowser = (pdf: Uint8Array, options: Parameters<typeof finishPdfWithBrowser>[1], deadline?: RenderDeadline) =>
    finishPdfWithBrowser(pdf, options, withTab, deadline)
  const renderer: Renderer = {
    async bookPdf(input, opts = {}) {
      const parsedOptions = parseBookPdfOptions(opts)
      return withinRenderPermit(parsedOptions.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const { book, options, fontCss: resolvedFontCss, fontFailures, established, preflight } = await prepareRenderBook(input, parsedOptions, deadline.signal)
        const seededOptions = { ...options, preflight: withPreflightSeed(options.preflight, preflight) }
        const watermarkCopies = watermarkCopyStamper(parsedOptions, resolvedFontCss, deadline, withTab)
        const output = await renderBrowserBookPdf(
          book,
          seededOptions,
          resolvedFontCss,
          {
            render: (setup, pdf, pageWidth, part) =>
              withTab({ ...setup, deadline }, async (tab) => {
                const captures = await prepareBackdropRasters(tab, options.effects)
                const printed = await printWithOverflow(tab, pageWidth, part, pdf)
                return { ...printed, bytes: await tagBackdropRasters(printed.bytes, captures) }
              }),
            fontFaces: (options) => fontFaces(options.fonts),
            finish: (pdf, options) => finishWithBrowser(pdf, options, deadline),
            watermark: parsedOptions.watermark
              ? async (pdf, pages) => {
                  const [watermarked] = await watermarkCopies.stamp([watermarkPartFromFacts(pdf, pages)])
                  return watermarked as Uint8Array
                }
              : undefined,
            fontFailures,
          },
          established.day,
        )
        watermarkCopies.validate()
        return protectPdf(output, parsedOptions, deadline)
      })
    },
    async bookPlan(input, opts = {}) {
      opts = parseBookPlanOptions(opts)
      return withinRenderPermit(opts.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const { book, options, fontCss: resolvedFontCss, fontFailures, established } = await prepareRenderBook(input, opts, deadline.signal)
        return renderBrowserBookPlan(
          book,
          { ...options, fontFailures },
          `${resolvedFontCss}${fontFaces(options.fonts)}`,
          (setup, body) => withTab({ ...setup, deadline }, body),
          established.day,
        )
      })
    },
    async pagePdf(input, opts = {}) {
      const parsedOptions = parsePagePdfOptions(opts ?? {}, 'pagePdf')
      return withinRenderPermit(parsedOptions.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const overflows: OverflowEntry[] = []
        const prepared = await prepareRenderedPage(input, parsedOptions, parsedOptions.motifs, deadline.signal, 'print')
        refuseProgressUnlessOneComposition(parsedOptions, pageCompositionCount([prepared.page], parsedOptions.slots))
        const watermarkCopies = watermarkCopyStamper(parsedOptions, prepared.fontCss, deadline, withTab)
        const bytes = await renderSlotCopyPdfs(parsedOptions.slots, async (copySlots) => {
          const effectiveSlots = effectiveCopySlots(parsedOptions.slots, copySlots, prepared.established.slots)
          const pageWithDay = fillPageAsOfBindings(prepared.page, prepared.established.day)
          const { value: page, slots } = await filledPage(pageWithDay, effectiveSlots, deadline.signal)
          const resolvedLayoutScripts = await resolveRenderLayoutScripts(printedPageAuthorHtml(page))
          const printed = await renderPagePdf(
            page,
            slots,
            { ...prepared.options, limits: innerLimits(prepared.options.limits), press: undefined, overflow: undefined },
            { withTab },
            undefined,
            deadline,
            prepared.fontCss,
            prepared.fontFailures,
            resolvedLayoutScripts,
            Boolean(parsedOptions.watermark),
            pagesTagged([isPrintedHtmlPage(page)], false),
          )
          if (printed.overflow) overflows.push(printed.overflow)
          const [watermarked] = await watermarkCopies.stamp([{ ...printed, page }])
          return watermarked as Uint8Array
        })
        watermarkCopies.validate()
        const output = await withDocumentMetadata(
          await finishWithBrowser(await addOutline(bytes, prepared.outlineSource), prepared.options, deadline),
          parsedOptions.metadata,
          outputDate([prepared.established.day]),
          printedPageDirection(prepared.page),
        )
        if (overflows.length) parsedOptions.overflow?.report?.({ entries: overflows })
        return protectPdf(await enforce(output, parsedOptions.limits), parsedOptions, deadline)
      })
    },
    async pageImage(input, opts = {}) {
      const parsedOptions = parsePageImageOptions(opts)
      return withinRenderPermit(parsedOptions.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const prepared = await prepareRenderedPage(input, parsedOptions, parsedOptions.motifs, deadline.signal, 'screen')
        refuseProgressUnlessOneComposition(parsedOptions, pageCompositionCount([prepared.page]))
        return renderPreparedPageImage(prepared, parsedOptions, deadline, withTab)
      })
    },
    async coverImage(input, opts) {
      opts = parseCoverImageOptions(opts)
      const cover = Cover.parse(input)
      const plan = coverImagePlan(cover, opts)
      const options = parseImageRenderOptions(plan.options, 'coverImage')
      return await withinRenderPermit(options.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const established = await resolveRenderDayContext(cover.page, options, deadline.signal)
        const prepared = await prepareRenderedPageValue(cover.page, options, options.motifs, deadline.signal, established, 'screen')
        refuseProgressUnlessOneComposition(options, pageCompositionCount([prepared.page]))
        return renderPreparedPageImage(prepared, options, deadline, withTab, surfacePreflight(options.preflight, 1))
      })
    },
    async pagesPdf(inputs, opts = {}) {
      const parsedOptions = parsePagePdfOptions(opts ?? {}, 'pagesPdf')
      return withinRenderPermit(parsedOptions.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const parsedDocuments = await Promise.all(
          inputs.map(async (input) => {
            const document = parseDocument(input, { newId: parsedOptions.newId })
            const brand = await resolveRenderBrand(document, parsedOptions.brandSource, deadline.signal)
            const page = pageOrPrintedFromDocument(document, brand)
            return { page, outlineSource: document.kind === 'printed' ? documentOutlineSource(document) : undefined }
          }),
        )
        const parsed = parsedDocuments.map(({ page }) => page)
        refuseProgressUnlessOneComposition(parsedOptions, pageCompositionCount(parsed, parsedOptions.slots))
        const contexts = await resolveRenderDayContexts(parsed, parsedOptions, deadline.signal)
        const expanded = await Promise.all(
          parsed.map((page, index) => {
            const day = contexts.pages[index]?.day
            return expandRenderedPageValue(page, parsedOptions, deadline.signal, day, 'print')
          }),
        )
        const prepared = await prepareRenderedPages(expanded, parsedOptions, deadline.signal)
        const expandedPages = expanded.map((item, index) => fillPageAsOfBindings(item.page, contexts.pages[index]?.day))
        const watermarkCopies = watermarkCopyStamper(parsedOptions, prepared.fontCss, deadline, withTab)
        const bytes = await renderSlotCopyPdfs(parsedOptions.slots, async (copySlots) => {
          const effectiveSlots = effectiveCopySlots(parsedOptions.slots, copySlots, contexts.pages[0]?.slots)
          const { value: pages, slots, frameGroups } = await filledPages(expandedPages, effectiveSlots, deadline.signal)
          const resolvedLayoutScripts = await resolveRenderLayoutScripts(pages.map(printedPageAuthorHtml).join(''))
          return renderPagesPdf(
            pages,
            slots,
            { ...prepared.options, limits: innerLimits(prepared.options.limits), press: undefined },
            {
              pagePdf: (page, slots, options, inputIndex, tagged) =>
                renderPagePdf(
                  page,
                  slots,
                  { ...options, preflight: withPreflightSeed(options.preflight, expanded[inputIndex]?.preflight) },
                  { withTab },
                  inputIndex,
                  deadline,
                  prepared.fontCss,
                  prepared.fontFailures,
                  resolvedLayoutScripts,
                  Boolean(parsedOptions.watermark),
                  tagged,
                ),
              piecePdf: (page, slots, geometry, css, options, tagged) =>
                renderPiecePdf(page, slots, geometry, css, options, { withTab }, deadline, resolvedLayoutScripts, Boolean(parsedOptions.watermark), tagged),
              fontFaces: (options) => `${prepared.fontCss}${fontFaces(options.fonts)}`,
              finish: async (pdf) => pdf,
              watermark: watermarkCopies.stamp,
            },
            frameGroups,
            parsedDocuments.map(({ outlineSource }) => outlineSource),
          )
        })
        watermarkCopies.validate()
        const output = await enforce(
          await withDocumentMetadata(
            await finishWithBrowser(bytes, parsedOptions, deadline),
            parsedOptions.metadata,
            outputDate(contexts.days),
            expanded[0] ? printedPageDirection(expanded[0].page) : undefined,
          ),
          parsedOptions.limits,
        )
        return protectPdf(output, parsedOptions, deadline)
      })
    },

    async deckPdf(input, opts = {}) {
      const options = parseDeckPdfOptions(opts)
      refuseProgressUnlessOneComposition(options, 0)
      return withinRenderPermit(options.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const deck = await resolveRenderDeck(input, options.newId, options.brandSource, deadline.signal)
        const established = await resolveRenderDayContext(deck, options, deadline.signal)
        enforceDeckLimits(deck, options.limits)
        const watermarkCopies = watermarkCopyStamper(options, '', deadline, withTab)
        const bytes = await renderSlotCopyPdfs(options.slots, async (copySlots) => {
          const effectiveSlots = effectiveCopySlots(options.slots, copySlots, established.slots)
          const { value: prepared, slots } = await fillDeckForDay(deck, established.day, effectiveSlots, deadline.signal)
          const htmlSlides = prepared.slides.map((slide) => ('kind' in slide.content && slide.content.kind === 'html' ? slide.content.html : '')).join('')
          const resolvedLayoutScripts = await resolveRenderLayoutScripts(htmlSlides)
          return renderDeckPdf(
            prepared,
            { ...options, limits: copyLimits(options.limits, options.slots), press: undefined },
            {
              renderPdf: (setup, pdf, frames) =>
                withTab(
                  {
                    ...setup,
                    slots: slotsForDocument(
                      slots,
                      frames.map((frame) => [frame]),
                    ),
                    readiness: renderReadiness('refuse', false),
                    deadline,
                  },
                  (tab) => pdfWithBackdropRasters(tab, pdf, options.effects),
                ),
              fontFaces: (options) => fontFaces(options.fonts),
              finish: async (pdf) => pdf,
              watermark: options.watermark ? watermarkCopies.stamp : undefined,
              signal: deadline.signal,
            },
            established.day,
            resolvedLayoutScripts,
          )
        })
        watermarkCopies.validate()
        const output = await withDocumentMetadata(await finishWithBrowser(bytes, options, deadline), undefined, outputDate([established.day]))
        return protectPdf(output, options, deadline)
      })
    },

    async slideImage(input, index, opts = {}) {
      const options = parseSlideImageOptions(opts)
      refuseProgressUnlessOneComposition(options, 0)
      return withinRenderPermit(options.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const deck = await resolveRenderDeck(input, options.newId, options.brandSource, deadline.signal)
        const established = await resolveRenderDayContext(deck, options, deadline.signal)
        enforceDeckLimits(deck, options.limits)
        return renderSlideImage(deck, index, options, { withTab, layoutScripts: resolveRenderLayoutScripts }, deadline, established)
      })
    },

    async proofImage(input, opts) {
      opts = parseProofImageOptions(opts)
      return withinRenderPermit(RENDER_BOUND_MS, acquire, release, (deadline) =>
        withTab({ viewport: { width: 1, height: 1 }, scripts: true, html: '<!doctype html>', readiness: renderReadiness('refuse', false), deadline }, (tab) =>
          proofRasterImage(tab, input, opts),
        ),
      )
    },
    async close() {
      closed = true
      queue.close()
      await protectPdf.dispose()
      await keeper.close()
    },
  }
  return renderer
}
