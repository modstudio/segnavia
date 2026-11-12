import { Cover, pageOrPrintedFromDocument } from '@segnavia/format'
import { frameStyleSheets } from '@segnavia/frame/bridge'
import {
  fillPageAsOfBindings,
  type PreparedSlots,
  parseAsOfInputs,
  parseDocument,
  printedPageAuthorHtml,
  printedPageDirection,
} from '@segnavia/html'
import { type Browser, type BrowserContext, chromium, type Page as Tab } from 'playwright-core'
import { prepareRenderBook } from './book-expansion.ts'
import { parseBookPdfOptions, parseBookPlanOptions } from './book-options.ts'
import { renderBrowserBookPdf, renderBrowserBookPlan } from './book-render.ts'
import { resolveRenderBrand, resolveRenderDeck } from './brand.ts'
import { raceBrowserDisconnect } from './browser-disconnect.ts'
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
  assetSetup,
  copyLimits,
  enforceDeckLimits,
  innerLimits,
  type OverflowEntry,
  pageCompositionCount,
  parseComposedRenderOptions,
  refuseProgressUnlessOneComposition,
} from './options.ts'
import { outputDate } from './output-date.ts'
import { printWithOverflow } from './overflow.ts'
import { resolveRenderDayContext, resolveRenderDayContexts } from './page-as-of.ts'
import { expandRenderedPageValue, prepareRenderedPage, prepareRenderedPages, prepareRenderedPageValue } from './page-document.ts'
import { renderPreparedPageImage } from './page-image-render.ts'
import { renderPagePdf, renderPiecePdf } from './page-render.ts'
import { parsePagePdfOptions } from './page-render-options.ts'
import { renderPagesPdf, type WatermarkPart } from './pages-pdf.ts'
import { enforce } from './pdf-finish.ts'
import { finishPdfWithBrowser } from './pdf-output.ts'
import { surfacePreflight, withPreflightSeed } from './preflight.ts'
import { proofRasterImage } from './proof-image.ts'
import { type RenderDeadline, withinBound, withinRenderPermit } from './render-deadline.ts'
import { renderFailure } from './render-failure.ts'
import { renderQueue } from './render-queue.ts'
import { renderReadiness } from './render-readiness.ts'
import { DEFAULT_JS_HEAP_MB, type ParsedPagePdfOptions, RENDER_BOUND_MS, type Renderer, type RendererOptions } from './renderer.ts'
import { renderSlideImage } from './slide-image.ts'
import { effectiveCopySlots, renderSlotCopyPdfs } from './slot-copies.ts'
import { slotsForDocument } from './slot-document.ts'
import { fillDeckForDay, filledBook, filledPage, filledPages } from './slot-fill.ts'
import { watermarkDocument } from './watermark-markup.ts'
import { watermarkPageNumbers } from './watermark-options.ts'
import { stampWatermarkParts, watermarkPages } from './watermark-stamp.ts'

export { FontRefusedError } from '@segnavia/frame/fonts'
export type { MotifsOptions } from '@segnavia/frame/motifs'
export type { PreparedSlots, ResolvedPlacement, ResolvePlacement } from '@segnavia/html'
export { captureImage } from './capture-image.ts'
export { COVER_IMAGE_OMITTED, type CoverImageOptions, type CoverImagePlan, coverImagePlan } from './cover-image.ts'
export type { EffectsReport } from './effects/types.ts'
export {
  type ColorProfileUse,
  RenderColorProfileError,
  RendererUnavailableError,
  RenderLimitError,
  RenderOversetError,
  RenderRefusedError,
} from './errors.ts'
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
  SlideImageOptions,
} from './options.ts'
export type { PressDestination, PressImage, PressReport } from './press/types.ts'
export type { Watermark } from './watermark-options.ts'
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
  const finishWithBrowser = (pdf: Uint8Array, options: Parameters<typeof finishPdfWithBrowser>[1], deadline?: RenderDeadline) =>
    finishPdfWithBrowser(pdf, options, withTab, deadline)
  const applyWatermark = async (
    parts: readonly WatermarkPart[],
    options: ParsedPagePdfOptions,
    fontCss: string,
    deadline: RenderDeadline,
    pageCount?: number,
  ): Promise<Uint8Array[]> => {
    if (!options.watermark) return parts.map((part) => part.bytes)
    const geometries = await Promise.all(parts.map((part) => watermarkPages(part.bytes)))
    let nextPhysicalPage = 1
    const mapped = geometries.flatMap((partPages, partIndex) => {
      const part = parts[partIndex]
      if (!part) return []
      const physical = part.physicalPages ?? partPages.map(() => nextPhysicalPage++)
      return partPages.map((page, pageIndex) => ({
        part: partIndex,
        page: pageIndex + 1,
        physical: physical[pageIndex] as number,
        geometry: { ...page, direction: printedPageDirection(part.page), ...(part.page.lang ? { lang: part.page.lang } : {}) },
      }))
    })
    const selectedNumbers = new Set(watermarkPageNumbers(options.watermark, pageCount ?? mapped.length))
    const selected = mapped.filter((entry) => selectedNumbers.has(entry.physical))
    if (selected.length === 0) return parts.map((part) => part.bytes)
    const documentCss = parts.map((part) => frameStyleSheets(part.page.style, part.page.brand).join('')).join('')
    const html = watermarkDocument(options.watermark, selected.map((entry) => entry.geometry), `${documentCss}${options.css ?? ''}${fontCss}`)
    const layer = await withTab(
      {
        viewport: { width: 1024, height: 768 },
        scripts: false,
        html,
        readiness: { author: false, diagrams: false },
        deadline,
        ...assetSetup(options),
      },
      (tab) =>
        tab.pdf({
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        }),
    )
    return stampWatermarkParts(
      parts.map((part) => part.bytes),
      layer,
      selected.map((entry) => ({ part: entry.part, page: entry.page })),
    )
  }
  const renderer: Renderer = {
    async bookPdf(input, opts = {}) {
      const parsedOptions = parseBookPdfOptions(opts)
      return withinRenderPermit(parsedOptions.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const { book, options, fontCss: resolvedFontCss, fontFailures, established, preflight } = await prepareRenderBook(input, parsedOptions, deadline.signal)
        const seededOptions = { ...options, preflight: withPreflightSeed(options.preflight, preflight) }
        return renderBrowserBookPdf(
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
            fontFailures,
          },
          established.day,
        )
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
      const parsedOptions = parsePagePdfOptions(opts ?? {})
      return withinRenderPermit(parsedOptions.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const overflows: OverflowEntry[] = []
        const prepared = await prepareRenderedPage(input, parsedOptions, parsedOptions.motifs, deadline.signal, 'print')
        refuseProgressUnlessOneComposition(parsedOptions, pageCompositionCount([prepared.page], parsedOptions.slots))
        const bytes = await renderSlotCopyPdfs(parsedOptions.slots, async (copySlots) => {
          const effectiveSlots = effectiveCopySlots(parsedOptions.slots, copySlots, prepared.established.slots)
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
        const [watermarked] = await applyWatermark([{ bytes, page: prepared.page }], parsedOptions, prepared.fontCss, deadline)
        const output = await withDocumentMetadata(
          await finishWithBrowser(watermarked as Uint8Array, prepared.options, deadline),
          parsedOptions.metadata,
          outputDate([prepared.established.day]),
        )
        if (overflows.length) parsedOptions.overflow?.report?.({ entries: overflows })
        return enforce(output, parsedOptions.limits)
      })
    },
    async pageImage(input, opts = {}) {
      const parsedOptions = parseComposedRenderOptions(opts)
      return withinRenderPermit(parsedOptions.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const prepared = await prepareRenderedPage(input, parsedOptions, parsedOptions.motifs, deadline.signal, 'screen')
        refuseProgressUnlessOneComposition(parsedOptions, pageCompositionCount([prepared.page]))
        return renderPreparedPageImage(prepared, parsedOptions, deadline, withTab)
      })
    },
    async coverImage(input, opts) {
      const cover = Cover.parse(input)
      const plan = coverImagePlan(cover, opts)
      const options = parseComposedRenderOptions(plan.options)
      return await withinRenderPermit(options.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const established = await resolveRenderDayContext(cover.page, options, deadline.signal)
        const prepared = await prepareRenderedPageValue(cover.page, options, options.motifs, deadline.signal, established, 'screen')
        refuseProgressUnlessOneComposition(options, pageCompositionCount([prepared.page]))
        return renderPreparedPageImage(prepared, options, deadline, withTab, surfacePreflight(options.preflight, 1))
      })
    },

    async pagesPdf(inputs, opts = {}) {
      const parsedOptions = parsePagePdfOptions(opts ?? {})
      return withinRenderPermit(parsedOptions.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const parsed = await Promise.all(
          inputs.map(async (input) => {
            const document = parseDocument(input, { newId: parsedOptions.newId })
            const brand = await resolveRenderBrand(document, parsedOptions.brandSource, deadline.signal)
            const page = pageOrPrintedFromDocument(document, brand)
            return page
          }),
        )
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
        const bytes = await renderSlotCopyPdfs(parsedOptions.slots, async (copySlots) => {
          const effectiveSlots = effectiveCopySlots(parsedOptions.slots, copySlots, contexts.pages[0]?.slots)
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
              watermark: (parts, count) => applyWatermark(parts, parsedOptions, prepared.fontCss, deadline, count),
            },
            frameGroups,
          )
        })
        return enforce(
          await withDocumentMetadata(await finishWithBrowser(bytes, parsedOptions, deadline), parsedOptions.metadata, outputDate(contexts.days)),
          parsedOptions.limits,
        )
      })
    },

    async deckPdf(input, opts = {}) {
      const options = parseAsOfInputs(parseComposedRenderOptions(opts))
      refuseProgressUnlessOneComposition(options, 0)
      return withinRenderPermit(options.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const deck = await resolveRenderDeck(input, options.newId, options.brandSource, deadline.signal)
        const established = await resolveRenderDayContext(deck, options, deadline.signal)
        enforceDeckLimits(deck, options.limits)
        const bytes = await renderSlotCopyPdfs(options.slots, async (copySlots) => {
          const effectiveSlots = effectiveCopySlots(options.slots, copySlots, established.slots)
          const { value: prepared, slots } = await fillDeckForDay(deck, established.day, effectiveSlots, deadline.signal)
          const diagramScript = await resolveDiagramScript(
            prepared.slides.map((slide) => ('kind' in slide.content && slide.content.kind === 'html' ? slide.content.html : '')).join(''),
          )
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
                    readiness: renderReadiness('refuse', false, false),
                    deadline,
                  },
                  (tab) => pdfWithBackdropRasters(tab, pdf, options.effects),
                ),
              fontFaces: (options) => fontFaces(options.fonts),
              finish: async (pdf) => pdf,
              signal: deadline.signal,
            },
            diagramScript,
            established.day,
          )
        })
        return withDocumentMetadata(await finishWithBrowser(bytes, options, deadline), undefined, outputDate([established.day]))
      })
    },

    async slideImage(input, index, opts = {}) {
      const options = parseAsOfInputs(parseComposedRenderOptions(opts))
      refuseProgressUnlessOneComposition(options, 0)
      return withinRenderPermit(options.boundMs ?? RENDER_BOUND_MS, acquire, release, async (deadline) => {
        const deck = await resolveRenderDeck(input, options.newId, options.brandSource, deadline.signal)
        const established = await resolveRenderDayContext(deck, options, deadline.signal)
        enforceDeckLimits(deck, options.limits)
        return renderSlideImage(deck, index, options, { withTab, diagramScript: resolveDiagramScript }, deadline, established)
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
