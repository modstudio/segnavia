import {
  type Deck,
  fitPage,
  type ImageFit,
  Imposition,
  impose,
  impositionMarks,
  type Imposition as ParsedImposition,
  pagePlacementLayout,
} from '@segnavia/format'
import { newNonce, PRINT_READY_ATTRIBUTE } from '@segnavia/frame/bridge'
import { resolveNotesFontCss } from '@segnavia/frame/fonts'
import { fitImage, imageLayerStyles } from '@segnavia/frame/image-fit'
import {
  htmlSlideDocument,
  notesLayoutGeometry,
  type PrintOptions,
  paginateNotes,
  printableDeck,
  SLIDES_READY_DEADLINE_MS,
} from '@segnavia/frame/print-document'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import type { RenderOptions } from './index.ts'
import { type DependencyCache, dependencySetup } from './options.ts'
import { containFixedPageOverflow } from './overflow-containment.ts'
import { fontCssForRender } from './page-document.ts'
import { composeImposedPdf, drawClippedPage, embedOnePage } from './pdf-compose.ts'
import { pdfPixelBox } from './pdf-geometry.ts'
import { loadPdf } from './pdf-load.ts'

export type DeckPdfOptions = RenderOptions & PrintOptions

interface DeckPdfServices {
  renderPdf(
    setup: {
      viewport: { width: number; height: number }
      scripts: boolean
      html: string
      boundMs?: number
      beforeOutput?: (tab: Tab) => Promise<void>
      dependencyOrigins?: Iterable<string>
      dependencies?: DependencyCache
    },
    pdf: Parameters<Tab['pdf']>[0],
  ): Promise<Uint8Array>
  fontFaces(options: RenderOptions): string
  finish(pdf: Uint8Array, options: Pick<RenderOptions, 'effects' | 'limits' | 'press'>): Promise<Uint8Array>
  signal?: AbortSignal
}

async function waitForPrintReady(tab: Tab): Promise<void> {
  await tab
    .locator(`html[${PRINT_READY_ATTRIBUTE}]`)
    .waitFor({ timeout: SLIDES_READY_DEADLINE_MS })
    .catch(() => {})
}

function nameSlideError(error: unknown, id: string): never {
  if (error instanceof Error) {
    error.message = `Slide "${id}" could not be rendered: ${error.message}`
    throw error
  }
  throw new Error(`Slide "${id}" could not be rendered: ${String(error)}`)
}

export function firstNotesPages(pageOwners: readonly number[], slideCount: number): number[] {
  return Array.from({ length: slideCount }, (_, slide) => pageOwners.indexOf(slide))
}

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

async function paginateRenderedNotes(tab: Tab, maxSheets?: number): Promise<{ sheets: number; exceeded: boolean }> {
  if (maxSheets === undefined) return tab.evaluate(paginateNotes, null)
  return tab.evaluate(`(${paginateNotes.toString()})(null,${JSON.stringify(maxSheets)})`)
}

async function regularDeckPdf(deck: Deck, opts: DeckPdfOptions, services: DeckPdfServices): Promise<Uint8Array> {
  const htmlSlides = deck.slides.flatMap((slide, index) =>
    slide.content.kind === 'html' ? [{ index, id: slide.id, html: slide.content.html, printAtMs: slide.printAtMs ?? 0 }] : [],
  )
  const css = `${services.fontFaces(opts)}${opts.css ?? ''}`
  const slideCss = containFixedPageOverflow(css)
  const notesGeometry = opts.layout === 'notes' ? notesLayoutGeometry(deck.size, opts.notesPaper) : undefined
  const notesSheetFont = notesGeometry
    ? await fontCssForRender(
        resolveNotesFontCss(opts.notesFont, opts.fontSource ? { source: opts.fontSource } : undefined, services.signal ?? new AbortController().signal),
      )
    : undefined
  let pageOwners: number[] = []
  const [printable, rendered] = await Promise.all([
    services.renderPdf(
      {
        viewport: notesGeometry ? { width: Math.round(notesGeometry.sheet.width), height: Math.round(notesGeometry.sheet.height) } : deck.size,
        scripts: true,
        html: printableDeck(deck, { ...opts, css, notesSheetFont, omitHtmlSlideFrames: true }),
        boundMs: opts.boundMs,
        ...dependencySetup(opts),
        beforeOutput: async (tab) => {
          await placeRenderedImages(tab)
          if (notesGeometry) {
            const pagination = await paginateRenderedNotes(tab, opts.limits?.maxSheets)
            if (pagination.exceeded) {
              throw new RenderRefusedError(`The PDF needs more than ${opts.limits?.maxSheets} sheets; the limit is ${opts.limits?.maxSheets}.`)
            }
            pageOwners = await tab.locator('.sheet').evaluateAll((sheets) => sheets.map((sheet) => Number((sheet as HTMLElement).dataset.slideIndex)))
          }
          await opts.beforeOutput?.(tab)
        },
      },
      { preferCSSPageSize: true, printBackground: true },
    ),
    Promise.all(
      htmlSlides.map(async ({ index, id, html, printAtMs }) => {
        try {
          const bytes = await services.renderPdf(
            {
              viewport: deck.size,
              // The nonce policy, rather than disabling JavaScript in Chromium,
              // refuses author code while leaving the print bridge running.
              scripts: true,
              html: htmlSlideDocument(deck, html, { nonce: newNonce(), css: slideCss, printAtMs, dependencyOrigins: opts.dependencyOrigins }),
              boundMs: opts.boundMs,
              ...dependencySetup(opts),
              beforeOutput: waitForPrintReady,
            },
            {
              width: `${deck.size.width}px`,
              height: `${deck.size.height}px`,
              printBackground: true,
              pageRanges: '1',
              margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
            },
          )
          return { index, bytes }
        } catch (error) {
          nameSlideError(error, id)
        }
      }),
    ),
  ])
  const output = await loadPdf(printable)
  const pages = output.getPages()
  const slideBox = notesGeometry?.slide ?? { x: 0, y: 0, width: deck.size.width, height: deck.size.height }
  const geometry = pdfPixelBox(slideBox, notesGeometry?.sheet.height ?? deck.size.height)
  const firstPages = notesGeometry ? firstNotesPages(pageOwners, deck.slides.length) : []
  for (const item of rendered) {
    const pageIndex = notesGeometry ? (firstPages[item.index] ?? -1) : item.index
    const sheet = pages[pageIndex < 0 ? item.index : pageIndex]
    if (!sheet) throw new Error(`The print document has no sheet for slide "${deck.slides[item.index]?.id ?? item.index}".`)
    const embedded = await embedOnePage(output, item.bytes, `The rendered slide "${deck.slides[item.index]?.id ?? item.index}"`)
    drawClippedPage(sheet, embedded, geometry, geometry)
  }
  return services.finish(await output.save(), opts)
}

async function imposedDeckPdf(deck: Deck, imposition: ParsedImposition, opts: DeckPdfOptions, services: DeckPdfServices): Promise<Uint8Array> {
  const css = containFixedPageOverflow(`${services.fontFaces(opts)}${opts.css ?? ''}`)
  const imposed = impose(imposition, deck.slides.length)
  const marks = impositionMarks(imposition)
  opts.marks?.report?.({ omittedMarks: marks.flatMap((side) => side.omittedMarks) })
  const rendered = await Promise.all(
    deck.slides.map(async (slide, index) => {
      const single: Deck = { ...deck, slides: [slide] }
      try {
        const html =
          slide.content.kind === 'html'
            ? htmlSlideDocument(deck, slide.content.html, {
                nonce: newNonce(),
                css,
                printAtMs: slide.printAtMs ?? 0,
                dependencyOrigins: opts.dependencyOrigins,
              })
            : printableDeck(single, { ...opts, layout: 'slides', imposition: undefined, css })
        const bytes = await services.renderPdf(
          {
            viewport: deck.size,
            scripts: true,
            html,
            boundMs: opts.boundMs,
            ...dependencySetup(opts),
            beforeOutput: slide.content.kind === 'html' ? waitForPrintReady : slide.content.kind === 'image' ? placeRenderedImages : undefined,
          },
          {
            width: `${deck.size.width}px`,
            height: `${deck.size.height}px`,
            printBackground: true,
            pageRanges: '1',
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
          },
        )
        return { index, bytes }
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
  const pieces = rendered.map((item) => ({
    key: String(item.index),
    name: `The rendered slide "${deck.slides[item.index]?.id ?? item.index}"`,
    bytes: item.bytes,
    placements: placements.get(item.index) ?? [],
  }))
  return services.finish(await composeImposedPdf(imposed, pieces, marks, imposition.markColor), opts)
}

export async function renderDeckPdf(deck: Deck, opts: DeckPdfOptions, services: DeckPdfServices): Promise<Uint8Array> {
  if (!opts.imposition) return regularDeckPdf(deck, opts, services)
  if (opts.layout === 'notes') {
    throw new RenderRefusedError("layout: 'notes' and imposition cannot be combined. Remove either layout: 'notes' or imposition to clear this refusal.")
  }
  return imposedDeckPdf(deck, Imposition.parse(opts.imposition), opts, services)
}
