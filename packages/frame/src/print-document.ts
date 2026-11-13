// The frame-based print document a browser shows and prints.
// One sheet per slide: a playing slide prints its picture with every
// annotation shown, and its narration prints as its notes.

import {
  type AsOfDay,
  type Deck,
  type DocumentInput,
  deckFromDocument,
  fitPage,
  type Imposed,
  Imposition,
  type ImpositionInput,
  impose,
  type Limits,
  mixedImpositionGeometryRefusal,
  type OriginApproval,
  type Page,
  PageWidths,
  type PressGeometryField,
  type PrintInput,
  pageDirection,
  pagePlacementLayout,
  printPadding,
  printProperties,
  resolveDirection,
  type Slide,
  type SlotsOptions,
  sharedImpositionPress,
} from '@segnavia/format'
import {
  classifyMediaAnswer,
  type HtmlPage,
  isPrintedHtmlPage,
  type PlacementsOptions,
  pageOrPrintedFromInput,
  parseDocument,
  placementPlaceholderSource,
  resolvePageHtml,
} from '@segnavia/html'
import { frameDocument, frameSandbox, frameStyleSheets, newNonce } from './bridge.ts'
import { type DeckSheetGeometry, deckPressSettings } from './deck-press.ts'
import { refuseNamedDocumentBrand } from './document-brand-refusal.ts'
import { annotationFocusBox, fitImage, type ImagePlacement, imageFrameStyle, imageLayerStyles } from './image-fit.ts'
import { imposedPaperBodies, imposedPaperDocument, placementBox } from './imposed-paper.ts'
import { layoutsForHtml } from './layout.ts'
import { notesDocument } from './notes-layout.ts'
import { FontRefusedError } from './page-fonts.ts'
import type { PageOrPrintedInput } from './printed-page-document.ts'
import { htmlSlideDocument, PRINT_COLOR_CSS } from './slide-print-document.ts'
import { annotationSvg, escapeHtml } from './svg.ts'

export { deckNotesPrint, deckPressSettings, deckSheetGeometry } from './deck-press.ts'
export { imposedPaperDocument, type PrintablePaperBody } from './imposed-paper.ts'
export { notesLayoutGeometry, paginateNotes } from './notes-layout.ts'
export { htmlSlideDocument } from './slide-print-document.ts'
export const SLIDES_READY_DEADLINE_MS = 4000
export const SECTIONED_IMPOSITION_REFUSAL =
  'Imposition shows one page per input and cannot show a sectioned printed document; show it with <segnavia-page> or print it with pagePdf to clear this refusal.'

export function refuseSectionedImpositionPage(page: Page): void {
  if (isPrintedHtmlPage(page)) throw new RangeError(SECTIONED_IMPOSITION_REFUSAL)
}
type MediaSlide = Extract<Slide['content'], { media: unknown }>
type ImageSlide = Extract<Slide['content'], { kind: 'image' }>
function missingMedia(content: MediaSlide): ImageSlide {
  return { kind: 'image', src: placementPlaceholderSource(), alt: content.media.alt?.text ?? '', fit: content.media.fit }
}

export async function resolveMediaContent<R extends { kind: string }>(
  content: MediaSlide,
  placements: PlacementsOptions<R> | undefined,
  purpose: 'screen' | 'print',
  width: number,
  signal: AbortSignal,
  day?: AsOfDay,
): Promise<ImageSlide> {
  const placement = content.media
  if (!placements) return missingMedia(content)
  try {
    const answer = await placements.resolve(placement, { purpose, width, signal, day })
    signal.throwIfAborted()
    const classified = classifyMediaAnswer({ answer })
    if (classified.status === 'ok') {
      return { kind: 'image', src: classified.value.src, alt: placement.alt?.text ?? classified.value.media.alt?.text ?? '', fit: placement.fit }
    }
    placements.report?.({
      address: placement.address,
      page: placement.page,
      reason: classified.status,
      ...(classified.message === undefined ? {} : { message: classified.message }),
    })
  } catch (error) {
    if (signal.aborted) throw signal.reason
    const classified = classifyMediaAnswer({ error })
    placements.report?.({ address: placement.address, page: placement.page, reason: classified.status, message: classified.message })
  }
  return missingMedia(content)
}
export async function resolveDeckMedia<R extends { kind: string }>(
  deck: Deck,
  placements: PlacementsOptions<R> | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
  day?: AsOfDay,
): Promise<Deck> {
  const slides = await Promise.all(
    deck.slides.map(async (slide) =>
      'media' in slide.content ? { ...slide, content: await resolveMediaContent(slide.content, placements, purpose, deck.size.width, signal, day) } : slide,
    ),
  )
  return { ...deck, slides }
}

export interface PrintOptions {
  newId?: () => string
  // `slides` prints each slide on a sheet of its own size; `notes` prints it
  // on paper with its notes underneath.
  layout?: 'slides' | 'notes'
  notesPaper?: Omit<PrintInput, PressGeometryField> & { [Field in PressGeometryField]?: never }
  imposition?: ImpositionInput
  // Document title for the print dialog and saved PDF. Defaults to the deck
  // title; an empty value omits the tag.
  title?: string
  // Overrides the English "No speaker notes" placeholder in a mixed notes layout.
  labels?: { noSpeakerNotes?: string }
  // App-font name for the notes sheet's number and notes text. printDeck and
  // deckPdf resolve it through FontSource and embed the face in the notes head.
  // printableDeck does not resolve the face: pass the `{ family, css }` from
  // resolveNotesFontCss as `notesSheetFont`, or print with printDeck or deckPdf.
  // A named font without that value is refused. With no name, the sheet uses
  // sans-serif.
  notesFont?: string
  // Turns an image a slide names by path into something the printing context
  // can load. A server rendering offline passes a data URL.
  inline?: (src: string) => string
  baseCss?: string
  css?: string
  nonce?: string
  // Keeps every HTML slide's layout box but leaves its frame out.
  omitHtmlSlideFrames?: boolean
  slots?: SlotsOptions
  origins?: Iterable<OriginApproval>
  layoutScripts?: readonly import('./layout.ts').LoadedLayoutScript[]
  limits?: Limits
}

function documentTitle(deck: Pick<Deck, 'title'>, options: { title?: string }): string {
  const title = options.title ?? deck.title
  return title ? `<title>${escapeHtml(title)}</title>` : ''
}

function transformedMedia(width: number, height: number, src: string, alt: string, image: Deck['size'], placement: ImagePlacement, annotations = ''): string {
  const transform = `translate(${placement.x}px,${placement.y}px) scale(${placement.scale})`
  const frame = imageFrameStyle(placement, { width, height })
  const imageStyle = frame ? `border-radius:${frame.borderRadius};box-shadow:${frame.boxShadow};` : ''
  return `<div style="position:relative;width:${width}px;height:${height}px;overflow:hidden"><div style="position:absolute;left:0;top:0;width:${image.width}px;height:${image.height}px;transform:${transform};transform-origin:0 0"><img src="${src}" alt="${escapeHtml(alt)}" style="width:${image.width}px;height:${image.height}px;display:block;${imageStyle}">${annotations}</div></div>`
}

function naturalImage(width: number, height: number, src: string, alt: string, fit: Deck['fit'], frame: boolean): string {
  return `<div style="position:relative;width:${width}px;height:${height}px;overflow:hidden"><div data-segnavia-image-layer data-slide-width="${width}" data-slide-height="${height}" data-fit="${fit}" data-frame="${frame}" style="position:absolute;left:0;top:0;transform-origin:0 0"><img src="${src}" alt="${escapeHtml(alt)}" style="display:block"></div></div>`
}

// Natural dimensions are available only after the print document's images
// settle. Like notes pagination, this runs only when handed a document.
export function placePrintImages(target: Document | null): void {
  const printDocument = target ?? document
  printDocument.querySelectorAll<HTMLElement>('[data-segnavia-image-layer]').forEach((layer) => {
    const image = layer.querySelector<HTMLImageElement>('img')
    if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) return
    const slide = { width: Number(layer.dataset.slideWidth), height: Number(layer.dataset.slideHeight) }
    const size = { width: image.naturalWidth, height: image.naturalHeight }
    const placement = fitImage(slide, size, layer.dataset.fit as Deck['fit'], undefined, layer.dataset.frame === 'true')
    const styles = imageLayerStyles(size, placement, slide)
    Object.assign(layer.style, styles.layer)
    Object.assign(image.style, styles.image)
  })
}

function slideBody(deck: Deck, slide: Slide, options: PrintOptions): string {
  const { width, height } = deck.size
  const inline = options.inline ?? ((src: string) => src)
  const content = slide.content
  if ('media' in content)
    return naturalImage(width, height, placementPlaceholderSource(), content.media.alt?.text ?? '', content.media.fit ?? deck.fit, deck.frame)
  const frame = (html: string) => {
    const layoutScripts = layoutsForHtml(html, options.layoutScripts ?? [])
    return `<iframe sandbox="${frameSandbox(deck.scripts)}" srcdoc="${escapeHtml(htmlSlideDocument(deck, html, { nonce: options.nonce ?? newNonce(), baseCss: options.baseCss, css: options.css, printAtMs: slide.printAtMs ?? 0, origins: options.origins, layoutScripts }))}" style="width:${width}px;height:${height}px;border:0;display:block"></iframe>`
  }
  switch (content.kind) {
    case 'html':
      return options.omitHtmlSlideFrames ? '' : frame(content.html)
    case 'url': {
      // A URL slide's host-served document is outside the frame policy that blocks form submission.
      return `<iframe sandbox="${frameSandbox('refuse')}" src="${escapeHtml(content.src)}" style="width:${width}px;height:${height}px;border:0;display:block"></iframe>`
    }
    case 'image':
      return naturalImage(width, height, escapeHtml(inline(content.src)), content.alt, content.fit ?? deck.fit, content.frame ?? deck.frame)
    case 'shot': {
      const focus = annotationFocusBox(content.shot.size, content.shot.annotations)
      const placement = fitImage(deck.size, content.shot.size, content.fit ?? deck.fit, focus, content.frame ?? deck.frame)
      const annotations = annotationSvg(content.shot.size, content.shot.annotations)
      return transformedMedia(width, height, escapeHtml(inline(content.src)), content.shot.title, content.shot.size, placement, annotations)
    }
    case 'shot-ref':
      throw new Error(`Slide "${slide.id}" names its shot by reference; resolve it before printing (resolveShots).`)
  }
}

export function printableDeck(input: DocumentInput, options: PrintOptions & { notesSheetFont?: { family: string; css: string } } = {}): string {
  const document = parseDocument(input, { newId: options.newId })
  refuseNamedDocumentBrand(document, 'printableDeckValue')
  return printableDeckValue(deckFromDocument(document), options)
}

function printableSlideSheets(deck: Deck, options: PrintOptions, geometry: DeckSheetGeometry | undefined): string {
  const { width, height } = deck.size
  const sheetWidth = geometry?.sheet.width ?? width
  const sheetHeight = geometry?.sheet.height ?? height
  const padding = geometry?.padding ?? 0
  const sheets = deck.slides.map((slide) => `<section class="sheet">${slideBody(deck, slide, options)}</section>`)
  return `<!doctype html><html><head><meta charset="utf-8">${documentTitle(deck, options)}<style>@page{size:${sheetWidth}px ${sheetHeight}px;margin:0}html,body{margin:0}${geometry?.active ? printProperties(geometry.print) : ''}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.sheet{width:${sheetWidth}px;height:${sheetHeight}px;box-sizing:border-box;padding:${padding}px;overflow:hidden;break-after:page}</style></head><body>${sheets.join('')}</body></html>`
}

export function printableDeckValue(deck: Deck, options: PrintOptions & { notesSheetFont?: { family: string; css: string } } = {}): string {
  const press = deckPressSettings(deck, options)
  if (options.imposition) {
    return printableDeckValueDocument(deck, { ...options, imposition: options.imposition }).html
  }
  if ((options.layout ?? 'slides') === 'slides') return printableSlideSheets(deck, options, press.sheet)
  if (options.notesFont !== undefined && options.notesSheetFont === undefined) {
    throw new FontRefusedError(
      `notes could not establish app font ${JSON.stringify(options.notesFont)}; print with printDeck or deckPdf, or resolve it with resolveNotesFontCss and pass the result, to clear this refusal.`,
    )
  }
  return notesDocument(deck, {
    notesPaper: press.notes,
    slideBody: (slide) => slideBody(deck, slide, options),
    title: options.title ?? deck.title,
    labels: options.labels,
    font: options.notesSheetFont,
  })
}

export interface PrintablePagesOptions {
  baseCss?: string
  css?: string
  nonce?: string
  cspExtra?: string
  slots?: SlotsOptions
  origins?: Iterable<OriginApproval>
  pageWidths?: PageWidths
  layoutScripts?: readonly import('./layout.ts').LoadedLayoutScript[]
  limits?: Limits
}

export interface PrintablePagesDocument {
  html: string
  imposed: Imposed
}

export interface PrintableDeckDocument {
  html: string
  imposed: Imposed
}

export function printableDeckDocument(input: DocumentInput, options: PrintOptions & { imposition: ImpositionInput }): PrintableDeckDocument {
  const document = parseDocument(input, { newId: options.newId })
  refuseNamedDocumentBrand(document, 'printableDeckValueDocument')
  return printableDeckValueDocument(deckFromDocument(document), options)
}

export function printableDeckValueDocument(deck: Deck, options: PrintOptions & { imposition: ImpositionInput }): PrintableDeckDocument {
  deckPressSettings(deck, options)
  if (options.layout === 'notes') {
    throw new RangeError("layout: 'notes' and imposition cannot be combined. Remove either layout: 'notes' or imposition to clear this refusal.")
  }
  const imposition = Imposition.parse(options.imposition)
  const imposed = impose(imposition, deck.slides.length, deck.print)
  const placementBody = (paper: number, side: 'front' | 'back') =>
    imposed.placements
      .filter((placement) => placement.paper === paper && placement.side === side)
      .map((placement) => {
        const fit = fitPage({ size: deck.size }, placement, imposition.fit)
        const layout = pagePlacementLayout(deck.size, placement, fit)
        const slide = deck.slides[placement.page]
        if (!slide) throw new RangeError(`The placement names missing slide ${placement.page}.`)
        return placementBox(
          (dimensions) => `<div style="position:absolute;${dimensions}">${slideBody(deck, slide, options)}</div>`,
          placement,
          layout,
          fit.scale,
        )
      })
      .join('')
  // Papers and placement boxes use physical coordinates; each slide frame
  // keeps its own direction while the document keeps the deck's direction.
  const rootAttributes = ` dir="${resolveDirection(deck.dir, deck.lang, deck.title)}"${deck.lang ? ` lang="${escapeHtml(deck.lang)}"` : ''}`
  return { html: imposedPaperDocument(imposed.paper, rootAttributes, imposedPaperBodies(imposed, placementBody), documentTitle(deck, options)), imposed }
}

function pageFrame(page: HtmlPage, imposition: Imposition, placement: ReturnType<typeof impose>['placements'][number], options: PrintablePagesOptions): string {
  const fit = fitPage(page, placement, imposition.fit, options.pageWidths)
  const layout = pagePlacementLayout(page.size, placement, fit)
  const properties = page.print ? printProperties(page.print) : ''
  const padding = layout.inset ? printPadding(placement.bleed) : ''
  const nonce = options.nonce ?? newNonce()
  const srcdoc = frameDocument(page.html, {
    scripts: page.scripts,
    nonce,
    dir: pageDirection(page),
    lang: page.lang,
    fonts: page.style?.fonts,
    sheets: frameStyleSheets(page.style, page.brand, `${PRINT_COLOR_CSS}${properties}${padding}${options.baseCss ?? ''}`),
    css: options.css,
    csp: options.cspExtra || undefined,
    reportHeight: false,
    relayKeys: false,
    layoutScripts: layoutsForHtml(page.html, options.layoutScripts ?? []),
    printBackground: true,
    origins: options.origins,
  })
  return placementBox(
    (dimensions) =>
      `<iframe sandbox="${frameSandbox(page.scripts)}" srcdoc="${escapeHtml(srcdoc)}" style="position:absolute;${dimensions};border:0;display:block"></iframe>`,
    placement,
    layout,
    fit.scale,
  )
}

// Builds only the positioned placement boxes for one physical paper, so the
// browser element and the print document use exactly the same frame markup.
export function printablePaper(
  pages: HtmlPage[],
  imposition: Imposition,
  imposed: Imposed,
  paper: number,
  options: PrintablePagesOptions = {},
  side: 'front' | 'back' = 'front',
): string {
  return imposed.placements
    .filter((placement) => placement.paper === paper && placement.side === side)
    .map((placement) => pageFrame(pages[placement.page] as HtmlPage, imposition, placement, options))
    .join('')
}

// This frame-based document is for a browser to show and print. The frame
// bridge carries propagated root backgrounds onto a printable element; the
// server renderer still uses top-level page renders for PDF composition.
function loweredPrintablePages(inputs: PageOrPrintedInput[], valueEntry: string): HtmlPage[] {
  return inputs.map((input) => {
    const document = parseDocument(input)
    refuseNamedDocumentBrand(document, valueEntry)
    const page = pageOrPrintedFromInput(document)
    refuseSectionedImpositionPage(page)
    return resolvePageHtml(page)
  })
}

export function printablePagesDocument(inputs: PageOrPrintedInput[], imposition: Imposition, options: PrintablePagesOptions = {}): PrintablePagesDocument {
  return printableHtmlPagesDocument(loweredPrintablePages(inputs, 'printablePageValuesDocument'), imposition, options)
}

export function printablePageValuesDocument(pages: Page[], imposition: Imposition, options: PrintablePagesOptions = {}): PrintablePagesDocument {
  return printableHtmlPagesDocument(
    pages.map((page) => {
      refuseSectionedImpositionPage(page)
      return resolvePageHtml(page, { origins: options.origins })
    }),
    imposition,
    options,
  )
}

export function printableHtmlPagesDocument(pages: HtmlPage[], imposition: Imposition, options: PrintablePagesOptions = {}): PrintablePagesDocument {
  if (pages.length === 0) throw new RangeError('There is nothing to print. Pass at least one page to clear this refusal.')
  const geometryRefusal = mixedImpositionGeometryRefusal(pages)
  if (geometryRefusal) throw new RangeError(geometryRefusal)
  options = { ...options, pageWidths: options.pageWidths === undefined ? undefined : PageWidths.parse(options.pageWidths) }
  const imposed = impose(imposition, pages.length, sharedImpositionPress(pages))
  // The document writes no text and uses physical paper positions, so its
  // direction is left to right; each page keeps its own direction in its frame.
  const bodies = imposedPaperBodies(imposed, (paper, side) => printablePaper(pages, imposition, imposed, paper, options, side))
  const html = imposedPaperDocument(imposed.paper, ' dir="ltr"', bodies)
  return { html, imposed }
}

export function printablePages(inputs: PageOrPrintedInput[], imposition: Imposition, options: PrintablePagesOptions = {}): string {
  return printableHtmlPagesDocument(loweredPrintablePages(inputs, 'printablePageValues'), imposition, options).html
}

export function printablePageValues(pages: Page[], imposition: Imposition, options: PrintablePagesOptions = {}): string {
  return printablePageValuesDocument(pages, imposition, options).html
}
