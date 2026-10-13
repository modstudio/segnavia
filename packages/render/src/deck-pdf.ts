import { type Deck, fitPage, Imposition, impose, MM_PER_PT, type Imposition as ParsedImposition, pagePlacementLayout } from '@segnavia/format'
import { newNonce } from '@segnavia/frame/bridge'
import { htmlSlideDocument, notesLayoutGeometry, type PrintOptions, printableDeck } from '@segnavia/frame/print-document'
import { PDFDocument } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import type { RenderOptions } from './index.ts'
import { drawClippedPage, embedOnePage } from './pdf-compose.ts'
import { pdfBox, pdfPixelBox } from './pdf-geometry.ts'

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
  enforce(pdf: Uint8Array, limits: RenderOptions['limits']): Promise<Uint8Array>
}

function nameSlideError(error: unknown, id: string): never {
  if (error instanceof Error) {
    error.message = `Slide "${id}" could not be rendered: ${error.message}`
    throw error
  }
  throw new Error(`Slide "${id}" could not be rendered: ${String(error)}`)
}

async function regularDeckPdf(deck: Deck, opts: DeckPdfOptions, services: DeckPdfServices): Promise<Uint8Array> {
  const htmlSlides = deck.slides.flatMap((slide, index) => (slide.content.kind === 'html' ? [{ index, id: slide.id, html: slide.content.html }] : []))
  const css = `${services.fontFaces(opts)}${opts.css ?? ''}`
  const notesGeometry = opts.layout === 'notes' ? notesLayoutGeometry(deck.size, opts.notesPaper) : undefined
  const [printable, rendered] = await Promise.all([
    services.renderPdf(
      {
        viewport: notesGeometry ? { width: Math.round(notesGeometry.sheet.width), height: Math.round(notesGeometry.sheet.height) } : deck.size,
        scripts: deck.scripts === 'sandboxed',
        html: printableDeck(deck, { ...opts, css, omitHtmlSlideFrames: true }),
        boundMs: opts.boundMs,
        beforeOutput: opts.beforeOutput,
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
              html: htmlSlideDocument(deck, html, { nonce: newNonce(), css }),
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
  for (const item of rendered) {
    const sheet = pages[item.index]
    if (!sheet) throw new Error(`The print document has no sheet for slide "${deck.slides[item.index]?.id ?? item.index}".`)
    const embedded = await embedOnePage(output, item.bytes, `The rendered slide "${deck.slides[item.index]?.id ?? item.index}"`)
    drawClippedPage(sheet, embedded, geometry, geometry)
  }
  return services.enforce(await output.save(), opts.limits)
}

async function imposedDeckPdf(deck: Deck, imposition: ParsedImposition, opts: DeckPdfOptions, services: DeckPdfServices): Promise<Uint8Array> {
  const css = `${services.fontFaces(opts)}${opts.css ?? ''}`
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
            scripts: deck.scripts === 'sandboxed',
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
  const output = await PDFDocument.create()
  const embedded = new Map<number, Awaited<ReturnType<typeof embedOnePage>>>()
  for (const item of rendered)
    embedded.set(item.index, await embedOnePage(output, item.bytes, `The rendered slide "${deck.slides[item.index]?.id ?? item.index}"`))
  for (let paperIndex = 0; paperIndex < imposed.papers; paperIndex += 1) {
    const paper = output.addPage([imposed.paper.width / MM_PER_PT, imposed.paper.height / MM_PER_PT])
    for (const placement of imposed.placements) {
      if (placement.paper !== paperIndex) continue
      const slide = embedded.get(placement.page)
      if (!slide) throw new Error(`The rendered slide at index ${placement.page} was not embedded.`)
      const fit = fitPage({ size: deck.size }, placement, imposition.fit)
      const layout = pagePlacementLayout(deck.size, placement, fit)
      drawClippedPage(paper, slide, pdfBox(layout.paper, imposed.paper.height), pdfBox(placement.bleedBox, imposed.paper.height))
    }
  }
  return services.enforce(await output.save(), opts.limits)
}

export async function renderDeckPdf(deck: Deck, opts: DeckPdfOptions, services: DeckPdfServices): Promise<Uint8Array> {
  if (!opts.imposition) return regularDeckPdf(deck, opts, services)
  if (opts.layout === 'notes') {
    throw new RenderRefusedError("layout: 'notes' and imposition cannot be combined. Remove either layout: 'notes' or imposition to clear this refusal.")
  }
  return imposedDeckPdf(deck, Imposition.parse(opts.imposition), opts, services)
}
