import {
  type AsOfDay,
  type Deck,
  type FontFailure,
  fitPage,
  type ImageFit,
  Imposition,
  impose,
  impositionBoxes,
  impositionMarks,
  type Limits,
  type OriginApproval,
  type Imposition as ParsedImposition,
  pagePlacementLayout,
} from '@segnavia/format'
import { newNonce, StyleSheetRefusedError } from '@segnavia/frame/bridge'
import { hasDiagram } from '@segnavia/frame/diagrams'
import { resolveNotesFontCss } from '@segnavia/frame/fonts'
import { fitImage, imageLayerStyles } from '@segnavia/frame/image-fit'
import {
  deckPressSettings,
  htmlSlideDocument,
  notesLayoutGeometry,
  type PrintOptions,
  paginateNotes,
  printableDeckValue,
  resolveDeckMedia,
} from '@segnavia/frame/print-document'
import type { Page as Tab } from 'playwright-core'
import { fontLoadSetup } from './browser-tab.ts'
import {
  DECK_PRESS_SIZE_REMEDY,
  type DeckPressContext,
  deckPressContext,
  deckPrintablePdfOptions,
  deckPrintableViewport,
  htmlSlidePdfOptions,
  regularSlideDrawBox,
} from './deck-paper.ts'
import { deckFontFailures, firstNotesPages, waitForPrintReady } from './deck-render-helpers.ts'
import { captureDeckFont, type DeckWatermark, type RenderedDeckPage, watermarkImposedDeck, watermarkRegularDeck } from './deck-watermark.ts'
import { RenderLimitError, RenderRefusedError } from './errors.ts'
import type { RenderOptions } from './index.ts'
import type { ComposedRenderOptions } from './options.ts'
import { type Assets, assetSetup } from './options.ts'
import type { PageFontFacts } from './overflow.ts'
import { containFixedPageOverflow } from './overflow-containment.ts'
import { fontCssForRender, renderOptionsWithFontManifest } from './page-document.ts'
import { addPressBoxes, printCss } from './page-paper.ts'
import { composeImposedPdf, drawClippedPage, embedOnePage } from './pdf-compose.ts'
import { loadPdf } from './pdf-load.ts'
import { setPdfPageSize } from './pdf-page-size.ts'
import { type SurfacePreflight, type SurfacePreflightCapture, surfacePreflight } from './preflight.ts'
import { renderReadiness } from './render-readiness.ts'
import type { Watermark } from './watermark-options.ts'

export type DeckPdfOptions = ComposedRenderOptions & PrintOptions & { watermark?: Watermark }

export function resolveDeckFonts(deck: Deck, opts: RenderOptions, signal: AbortSignal) {
  return renderOptionsWithFontManifest(deck.style?.fonts, [], `deck ${JSON.stringify(deck.title)}`, opts, signal)
}

interface DeckPdfServices {
  renderPdf(
    setup: {
      viewport: { width: number; height: number }
      scripts: boolean
      html: string
      boundMs?: number
      beforeOutput?: (tab: Tab) => Promise<void>
      origins?: Iterable<OriginApproval>
      assets?: Assets
      limits?: Limits
      fontFailures?: FontFailure[]
      fontLoadReport?: (report: { failures: FontFailure[] }) => void
      preflightReport?: (capture: SurfacePreflightCapture) => void
    },
    pdf: Parameters<Tab['pdf']>[0],
    frames: readonly number[],
  ): Promise<Uint8Array>
  fontFaces(options: RenderOptions): string
  finish(pdf: Uint8Array, options: Pick<RenderOptions, 'effects' | 'limits' | 'press'>): Promise<Uint8Array>
  signal?: AbortSignal
  fontFailures?: FontFailure[]
  watermark?: DeckWatermark
}

function nameSlideError(error: unknown, id: string): never {
  if (error instanceof StyleSheetRefusedError) throw new RenderRefusedError(`Slide "${id}" could not be rendered: ${error.message}`)
  if (error instanceof Error) {
    error.message = `Slide "${id}" could not be rendered: ${error.message}`
    throw error
  }
  throw new Error(`Slide "${id}" could not be rendered: ${String(error)}`)
}

export { firstNotesPages } from './deck-render-helpers.ts'

async function placeRenderedImages(tab: Tab): Promise<void> {
  const layers = tab.locator('[data-segnavia-image-layer]')
  const facts = await layers.evaluateAll((elements) =>
    elements.map((element) => {
      const layer = element as HTMLElement
      const image = layer.querySelector('img') as HTMLImageElement | null
      return {
        slide: { width: Number(layer.dataset.slideWidth), height: Number(layer.dataset.slideHeight) },
        image: { width: image?.naturalWidth ?? 0, height: image?.naturalHeight ?? 0 },
        fit: layer.dataset.fit,
        frame: layer.dataset.frame === 'true',
      }
    }),
  )
  const styles = facts.map((fact) => {
    if (fact.image.width <= 0 || fact.image.height <= 0) return null
    const placement = fitImage(fact.slide, fact.image, fact.fit as ImageFit, undefined, fact.frame)
    return imageLayerStyles(fact.image, placement, fact.slide)
  })
  await layers.evaluateAll((elements, values) => {
    elements.forEach((element, index) => {
      const styles = values[index]
      if (!styles) return
      const layer = element as HTMLElement
      const image = layer.querySelector('img') as HTMLImageElement | null
      if (!image) return
      Object.assign(layer.style, styles.layer)
      Object.assign(image.style, styles.image)
    })
  }, styles)
}

async function paginateRenderedNotes(tab: Tab, sheets?: number): Promise<{ sheets: number; exceeded: boolean }> {
  if (sheets === undefined) return tab.evaluate(paginateNotes, null)
  return tab.evaluate(`(${paginateNotes.toString()})(null,${JSON.stringify(sheets)})`)
}

async function renderHtmlSlides(
  deck: Deck,
  opts: DeckPdfOptions,
  services: DeckPdfServices,
  press: DeckPressContext,
  slideBaseCss: string,
  fontFailures: FontFailure[],
  diagramScript: string | undefined,
  preflight: SurfacePreflight | undefined,
): Promise<RenderedDeckPage[]> {
  const slides = deck.slides.flatMap((slide, index) =>
    'kind' in slide.content && slide.content.kind === 'html' ? [{ index, id: slide.id, html: slide.content.html, printAtMs: slide.printAtMs ?? 0 }] : [],
  )
  return Promise.all(
    slides.map(async ({ index, id, html, printAtMs }) => {
      try {
        let font: PageFontFacts = {}
        const bytes = await services.renderPdf(
          {
            viewport: deckPrintableViewport(deck.size, undefined, press),
            // The nonce policy, rather than disabling JavaScript in Chromium,
            // refuses author code while leaving the print bridge running.
            scripts: true,
            html: htmlSlideDocument(deck, html, {
              nonce: newNonce(),
              baseCss: slideBaseCss,
              css: opts.css,
              printAtMs,
              origins: opts.origins,
              diagramScript,
            }),
            boundMs: opts.boundMs,
            ...assetSetup(opts),
            ...fontLoadSetup(fontFailures, opts.fontLoad?.report),
            preflightReport: preflight?.capture({ index, folio: String(index + 1) }),
            beforeOutput: async (tab) => {
              font = await captureDeckFont(tab, Boolean(opts.watermark), {
                prepare: (page) => waitForPrintReady(page, renderReadiness('refuse', hasDiagram(html), opts.waitForPageReady !== false)),
              })
            },
          },
          {
            ...htmlSlidePdfOptions(deck.size, press),
            pageRanges: '1',
          },
          [index],
        )
        return {
          index,
          bytes: press.slides && press.boxes ? await setPdfPageSize(bytes, press.boxes.bleedBox, DECK_PRESS_SIZE_REMEDY) : bytes,
          ...font,
        }
      } catch (error) {
        nameSlideError(error, id)
      }
    }),
  )
}

async function composeRegularSlides(
  output: Awaited<ReturnType<typeof loadPdf>>,
  deck: Deck,
  rendered: Array<{ index: number; bytes: Uint8Array }>,
  notesGeometry: ReturnType<typeof notesLayoutGeometry> | undefined,
  pageOwners: readonly number[],
  press: DeckPressContext,
): Promise<void> {
  const pages = output.getPages()
  const geometry = regularSlideDrawBox(deck.size, notesGeometry, press.sheet)
  const firstPages = notesGeometry ? firstNotesPages(pageOwners, deck.slides.length) : []
  for (const item of rendered) {
    const pageIndex = notesGeometry ? (firstPages[item.index] ?? -1) : item.index
    const sheet = pages[pageIndex < 0 ? item.index : pageIndex]
    if (!sheet) throw new Error(`The print document has no sheet for slide "${deck.slides[item.index]?.id ?? item.index}".`)
    const embedded = await embedOnePage(output, item.bytes, `The rendered slide "${deck.slides[item.index]?.id ?? item.index}"`)
    drawClippedPage(sheet, embedded, geometry, geometry)
  }
}

async function regularDeckPdf(
  deck: Deck,
  opts: DeckPdfOptions,
  services: DeckPdfServices,
  pressSettings: ReturnType<typeof deckPressSettings>,
  diagramScript?: string,
  preflight?: SurfacePreflight,
): Promise<Uint8Array> {
  const press = deckPressContext(pressSettings)
  const baseCss = services.fontFaces(opts)
  const slideBaseCss = containFixedPageOverflow(`${baseCss}${press.slides && press.print ? printCss(press.print, 'ltr') : ''}`)
  const notesGeometry = opts.layout === 'notes' ? notesLayoutGeometry(deck.size, pressSettings.notes) : undefined
  const notesSheetFont = notesGeometry
    ? await fontCssForRender(
        resolveNotesFontCss(opts.notesFont, opts.fontSource ? { source: opts.fontSource } : undefined, services.signal ?? new AbortController().signal),
      )
    : undefined
  const fontFailures = deckFontFailures(services.fontFailures ?? [], notesSheetFont)
  let pageOwners: number[] = []
  let printableFont: PageFontFacts = {}
  const [printable, rendered] = await Promise.all([
    services.renderPdf(
      {
        viewport: deckPrintableViewport(deck.size, notesGeometry, press),
        scripts: true,
        html: printableDeckValue(deck, { ...opts, baseCss, notesSheetFont, omitHtmlSlideFrames: true, diagramScript }),
        boundMs: opts.boundMs,
        ...assetSetup(opts),
        ...fontLoadSetup(fontFailures, opts.fontLoad?.report),
        preflightReport: preflight?.capture(),
        beforeOutput: async (tab) => {
          await placeRenderedImages(tab)
          if (notesGeometry) {
            const sheetsLimit = opts.limits?.sheets
            const pagination = await paginateRenderedNotes(tab, sheetsLimit)
            if (sheetsLimit !== undefined && pagination.exceeded) {
              throw new RenderLimitError('sheets', pagination.sheets, sheetsLimit, { atLeast: true })
            }
            pageOwners = await tab.locator('.sheet').evaluateAll((sheets) => sheets.map((sheet) => Number((sheet as HTMLElement).dataset.slideIndex)))
          }
          await opts.beforeOutput?.(tab)
          printableFont = await captureDeckFont(tab, Boolean(opts.watermark), notesGeometry ? { textRootSelector: '.sheet' } : {})
        },
      },
      deckPrintablePdfOptions(press),
      [],
    ),
    renderHtmlSlides(deck, opts, services, press, slideBaseCss, fontFailures, diagramScript, preflight),
  ])
  const output = await loadPdf(printable)
  await composeRegularSlides(output, deck, rendered, notesGeometry, pageOwners, press)
  let bytes = await output.save()
  bytes = await watermarkRegularDeck(services.watermark, bytes, deck, pageOwners, printableFont, rendered)
  if (press.active && press.boxes && press.print) {
    bytes = await setPdfPageSize(bytes, press.boxes.bleedBox, DECK_PRESS_SIZE_REMEDY)
    bytes = await addPressBoxes(bytes, press.boxes, press.print.markColor)
  }
  return services.finish(bytes, opts)
}

async function imposedDeckPdf(
  deck: Deck,
  imposition: ParsedImposition,
  opts: DeckPdfOptions,
  services: DeckPdfServices,
  diagramScript?: string,
  preflight?: SurfacePreflight,
): Promise<Uint8Array> {
  const baseCss = containFixedPageOverflow(services.fontFaces(opts))
  const imposed = impose(imposition, deck.slides.length, deck.print)
  const boxes = impositionBoxes(imposition, deck.print)
  const marks = impositionMarks(imposition, deck.print)
  const sides = boxes.map((sideBoxes) => ({ boxes: sideBoxes, marks: marks.find((entry) => entry.side === sideBoxes.side) }))
  const fontFailures = services.fontFailures ?? []
  preflight?.capture()({ fontFailures, slotFits: [] })
  opts.marks?.report?.({ omittedMarks: marks.flatMap((side) => side.omittedMarks) })
  const rendered = await Promise.all(
    deck.slides.map(async (slide, index) => {
      const single: Deck = { ...deck, slides: [slide] }
      const diagrams = 'kind' in slide.content && slide.content.kind === 'html' && hasDiagram(slide.content.html)
      try {
        let font: PageFontFacts = {}
        const html =
          'kind' in slide.content && slide.content.kind === 'html'
            ? htmlSlideDocument(deck, slide.content.html, {
                nonce: newNonce(),
                baseCss,
                css: opts.css,
                printAtMs: slide.printAtMs ?? 0,
                origins: opts.origins,
                diagramScript,
              })
            : printableDeckValue({ ...single, print: undefined }, { ...opts, layout: 'slides', imposition: undefined, baseCss, diagramScript })
        const bytes = await services.renderPdf(
          {
            viewport: deck.size,
            scripts: true,
            html,
            boundMs: opts.boundMs,
            ...assetSetup(opts),
            ...fontLoadSetup(fontFailures, opts.fontLoad?.report),
            preflightReport: preflight?.capture({ index, folio: String(index + 1) }),
            beforeOutput:
              'kind' in slide.content && slide.content.kind === 'html'
                ? async (tab) => {
                    font = await captureDeckFont(tab, Boolean(opts.watermark), {
                      prepare: (page) => waitForPrintReady(page, renderReadiness('refuse', diagrams, opts.waitForPageReady !== false)),
                    })
                  }
                : 'kind' in slide.content && slide.content.kind === 'image'
                  ? async (tab) => {
                      font = await captureDeckFont(tab, Boolean(opts.watermark), { prepare: placeRenderedImages })
                    }
                  : opts.watermark
                    ? async (tab) => {
                        font = await captureDeckFont(tab, true)
                      }
                    : undefined,
          },
          {
            width: `${deck.size.width}px`,
            height: `${deck.size.height}px`,
            printBackground: true,
            pageRanges: '1',
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
          },
          [index],
        )
        return { index, bytes, ...font }
      } catch (error) {
        nameSlideError(error, slide.id)
      }
    }),
  )
  const placements = new Map<number, Array<{ placement: (typeof imposed.placements)[number]; layout: ReturnType<typeof pagePlacementLayout> }>>()
  for (const placement of imposed.placements) {
    const fit = fitPage({ size: deck.size }, placement, imposition.fit)
    const group = placements.get(placement.page) ?? []
    group.push({ placement, layout: pagePlacementLayout(deck.size, placement, fit) })
    placements.set(placement.page, group)
  }
  const watermarked = await watermarkImposedDeck(services.watermark, deck, rendered)
  const pieces = rendered.map((item, index) => ({
    key: String(item.index),
    name: `The rendered slide "${deck.slides[item.index]?.id ?? item.index}"`,
    bytes: watermarked[index] as Uint8Array,
    placements: placements.get(item.index) ?? [],
  }))
  return services.finish(await composeImposedPdf(imposed, pieces, sides, imposition.markColor), opts)
}

export async function renderDeckPdf(deck: Deck, opts: DeckPdfOptions, services: DeckPdfServices, diagramScript?: string, day?: AsOfDay): Promise<Uint8Array> {
  let pressSettings: ReturnType<typeof deckPressSettings>
  try {
    pressSettings = deckPressSettings(deck, opts)
  } catch (error) {
    if (error instanceof RangeError) throw new RenderRefusedError(error.message)
    throw error
  }
  const signal = services.signal ?? AbortSignal.any([])
  const resolvedFonts = await resolveDeckFonts(deck, opts, signal)
  const resolvedDeck = await resolveDeckMedia(deck, opts.placements, 'print', signal, day)
  const resolvedServices = {
    ...services,
    fontFailures: resolvedFonts.fontFailures,
    fontFaces: (options: RenderOptions) => `${resolvedFonts.fontCss}${services.fontFaces(options)}`,
  }
  const preflight = surfacePreflight(opts.preflight, deck.slides.length)
  opts = { ...opts, ...resolvedFonts.options }
  if (!opts.imposition) {
    const output = await regularDeckPdf(resolvedDeck, opts, resolvedServices, pressSettings, diagramScript, preflight)
    preflight?.complete()
    return output
  }
  if (opts.layout === 'notes') {
    throw new RenderRefusedError("layout: 'notes' and imposition cannot be combined. Remove either layout: 'notes' or imposition to clear this refusal.")
  }
  const output = await imposedDeckPdf(resolvedDeck, Imposition.parse(opts.imposition), opts, resolvedServices, diagramScript, preflight)
  preflight?.complete()
  return output
}
