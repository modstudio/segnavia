import { type Deck, fitPage, Imposition, impose, type Imposition as ParsedImposition, pagePlacementLayout } from '@segnavia/format'
import { newNonce } from '@segnavia/frame/bridge'
import { htmlSlideDocument, notesLayoutGeometry, type PrintOptions, printableDeck } from '@segnavia/frame/print-document'
import { PDFDocument } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import type { RenderOptions } from './index.ts'
import { containFixedPageOverflow } from './overflow-containment.ts'
import { composeImposedPdf, drawClippedPage, embedOnePage } from './pdf-compose.ts'
import { pdfPixelBox } from './pdf-geometry.ts'

export type DeckPdfOptions = RenderOptions & PrintOptions

interface DeckPdfServices {
  renderPdf(
    setup: {
      viewport: { width: number; height: number }
      scripts: boolean
      html: string
      boundMs?: number
      beforeOutput?: (tab: Tab) => Promise<void>
    },
    pdf: Parameters<Tab['pdf']>[0],
  ): Promise<Uint8Array>
  fontFaces(options: RenderOptions): string
  finish(pdf: Uint8Array, options: Pick<RenderOptions, 'effects' | 'limits' | 'press'>): Promise<Uint8Array>
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

async function regularDeckPdf(deck: Deck, opts: DeckPdfOptions, services: DeckPdfServices): Promise<Uint8Array> {
  const htmlSlides = deck.slides.flatMap((slide, index) => (slide.content.kind === 'html' ? [{ index, id: slide.id, html: slide.content.html }] : []))
  const css = `${services.fontFaces(opts)}${opts.css ?? ''}`
  const slideCss = containFixedPageOverflow(css)
  const notesGeometry = opts.layout === 'notes' ? notesLayoutGeometry(deck.size, opts.notesPaper) : undefined
  let pageOwners: number[] = []
  const [printable, rendered] = await Promise.all([
    services.renderPdf(
      {
        viewport: notesGeometry ? { width: Math.round(notesGeometry.sheet.width), height: Math.round(notesGeometry.sheet.height) } : deck.size,
        scripts: true,
        html: printableDeck(deck, { ...opts, css, omitHtmlSlideFrames: true }),
        boundMs: opts.boundMs,
        beforeOutput: async (tab) => {
          if (notesGeometry) {
            await tab.evaluate(() => (window as Window & { segnaviaNotesReady?: Promise<void> }).segnaviaNotesReady)
            pageOwners = await tab.locator('.sheet').evaluateAll((sheets) => sheets.map((sheet) => Number((sheet as HTMLElement).dataset.slideIndex)))
          }
          await opts.beforeOutput?.(tab)
        },
      },
      { preferCSSPageSize: true, printBackground: true },
    ),
    Promise.all(
      htmlSlides.map(async ({ index, id, html }) => {
        try {
          const bytes = await services.renderPdf(
            {
              viewport: deck.size,
              scripts: deck.scripts === 'sandboxed',
              html: htmlSlideDocument(deck, html, { nonce: newNonce(), css: slideCss }),
              boundMs: opts.boundMs,
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
  const output = await PDFDocument.load(printable)
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
  const rendered = await Promise.all(
    deck.slides.map(async (slide, index) => {
      const single: Deck = { ...deck, slides: [slide] }
      try {
        const html =
          slide.content.kind === 'html'
            ? htmlSlideDocument(deck, slide.content.html, { nonce: newNonce(), css })
            : printableDeck(single, { ...opts, layout: 'slides', imposition: undefined, css })
        const bytes = await services.renderPdf(
          {
            viewport: deck.size,
            scripts: slide.content.kind === 'html' ? deck.scripts === 'sandboxed' : true,
            html,
            boundMs: opts.boundMs,
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
  return services.finish(await composeImposedPdf(imposed, pieces), opts)
}

export async function renderDeckPdf(deck: Deck, opts: DeckPdfOptions, services: DeckPdfServices): Promise<Uint8Array> {
  if (!opts.imposition) return regularDeckPdf(deck, opts, services)
  if (opts.layout === 'notes') {
    throw new RenderRefusedError("layout: 'notes' and imposition cannot be combined. Remove either layout: 'notes' or imposition to clear this refusal.")
  }
  return imposedDeckPdf(deck, Imposition.parse(opts.imposition), opts, services)
}
