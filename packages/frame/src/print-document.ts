// The frame-based print document a browser shows and prints.
// One sheet per slide: a playing slide prints its picture with every
// annotation shown, and its narration prints as its notes.

import {
  type Deck,
  fitPage,
  type Imposed,
  Imposition,
  type ImpositionInput,
  impose,
  type Page,
  type PrintInput,
  pagePlacementLayout,
  printPadding,
  printProperties,
  resolveDirection,
  type Slide,
} from '@segnavia/format'
import { frameDocument, newNonce } from './bridge.ts'
import { annotationFocusBox, fitImage, type ImagePlacement } from './image-fit.ts'
import { notesDocument } from './notes-layout.ts'
import { annotationSvg, escapeHtml } from './svg.ts'

export { notesLayoutGeometry } from './notes-layout.ts'

export interface PrintOptions {
  // `slides` prints each slide on a sheet of its own size; `notes` prints it
  // on paper with its notes underneath.
  layout?: 'slides' | 'notes'
  notesPaper?: PrintInput
  imposition?: ImpositionInput
  // Turns an image a slide names by path into something the printing context
  // can load. A server rendering offline passes a data URL.
  inline?: (src: string) => string
  css?: string
  nonce?: string
  // Keeps every HTML slide's layout box but leaves its frame out.
  omitHtmlSlideFrames?: boolean
}

const PRINT_COLOR_CSS = '*,*::before,*::after{print-color-adjust:exact;-webkit-print-color-adjust:exact}'

export function htmlSlideDocument(deck: Pick<Deck, 'scripts' | 'dir' | 'lang'>, html: string, options: { css?: string; nonce: string }): string {
  return frameDocument(html, {
    scripts: deck.scripts,
    nonce: options.nonce,
    dir: deck.dir,
    lang: deck.lang,
    css: `${PRINT_COLOR_CSS}${options.css ?? ''}`,
    reportHeight: false,
    relayKeys: false,
  })
}

function transformedMedia(width: number, height: number, src: string, alt: string, image: Deck['size'], placement: ImagePlacement, annotations = ''): string {
  const transform = `translate(${placement.x}px,${placement.y}px) scale(${placement.scale})`
  return `<div style="position:relative;width:${width}px;height:${height}px;overflow:hidden"><div style="position:absolute;left:0;top:0;width:${image.width}px;height:${image.height}px;transform:${transform};transform-origin:0 0"><img src="${src}" alt="${escapeHtml(alt)}" style="width:${image.width}px;height:${image.height}px;display:block">${annotations}</div></div>`
}

function naturalImage(width: number, height: number, src: string, alt: string, fit: Deck['fit']): string {
  return `<div style="position:relative;width:${width}px;height:${height}px;overflow:hidden"><div data-segnavia-image-layer data-slide-width="${width}" data-slide-height="${height}" data-fit="${fit}" style="position:absolute;left:0;top:0;transform-origin:0 0"><img src="${src}" alt="${escapeHtml(alt)}" onload="segnaviaPlaceImage(this)" style="display:block"></div></div>`
}

function slideBody(deck: Deck, slide: Slide, options: PrintOptions): string {
  const { width, height } = deck.size
  const inline = options.inline ?? ((src: string) => src)
  const content = slide.content
  const frame = (html: string) =>
    `<iframe sandbox="allow-scripts" srcdoc="${escapeHtml(htmlSlideDocument(deck, html, { nonce: options.nonce ?? newNonce(), css: options.css }))}" style="width:${width}px;height:${height}px;border:0;display:block"></iframe>`
  switch (content.kind) {
    case 'html':
      return options.omitHtmlSlideFrames ? '' : frame(content.html)
    case 'url':
      return `<iframe sandbox="allow-scripts" src="${escapeHtml(content.src)}" style="width:${width}px;height:${height}px;border:0;display:block"></iframe>`
    case 'image':
      return naturalImage(width, height, escapeHtml(inline(content.src)), content.alt, content.fit ?? deck.fit)
    case 'shot': {
      const focus = annotationFocusBox(content.shot.size, content.shot.annotations)
      const placement = fitImage(deck.size, content.shot.size, content.fit ?? deck.fit, focus)
      const annotations = annotationSvg(content.shot.size, content.shot.annotations)
      return transformedMedia(width, height, escapeHtml(inline(content.src)), content.shot.title, content.shot.size, placement, annotations)
    }
    case 'shot-ref':
      throw new Error(`Slide "${slide.id}" names its shot by reference; resolve it before printing (resolveShots).`)
  }
}

function imageFitScript(): string {
  return `<script>const segnaviaFitImage=${fitImage.toString()};function segnaviaPlaceImage(image){const layer=image.parentElement;const slide={width:Number(layer.dataset.slideWidth),height:Number(layer.dataset.slideHeight)};const size={width:image.naturalWidth,height:image.naturalHeight};const fit=segnaviaFitImage(slide,size,layer.dataset.fit);layer.style.width=size.width+'px';layer.style.height=size.height+'px';image.style.width=size.width+'px';image.style.height=size.height+'px';layer.style.transform='translate('+fit.x+'px,'+fit.y+'px) scale('+fit.scale+')'}</script>`
}

export function printableDeck(deck: Deck, options: PrintOptions = {}): string {
  const { width, height } = deck.size
  if (options.imposition) {
    return printableDeckDocument(deck, { ...options, imposition: options.imposition }).html
  }
  if ((options.layout ?? 'slides') === 'slides') {
    const sheets = deck.slides.map((slide) => `<section class="sheet">${slideBody(deck, slide, options)}</section>`)
    return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${width}px ${height}px;margin:0}html,body{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.sheet{width:${width}px;height:${height}px;overflow:hidden;break-after:page}</style>${imageFitScript()}</head><body>${sheets.join('')}</body></html>`
  }
  const document = notesDocument(deck, { notesPaper: options.notesPaper, slideBody: (slide) => slideBody(deck, slide, options) })
  return document.replace('</head>', `${imageFitScript()}</head>`)
}

export interface PrintablePagesOptions {
  css?: string
  nonce?: string
  cspExtra?: string
}

export interface PrintablePagesDocument {
  html: string
  imposed: Imposed
}

const mm = (value: number) => `${value}mm`

function imposedPaperDocument(
  imposed: Imposed,
  rootAttributes: string,
  placementBody: (paper: number, side: 'front' | 'back') => string,
  extraHead = '',
): string {
  const papers = Array.from({ length: imposed.papers }, (_, paper) =>
    (['front', 'back'] as const)
      .slice(0, imposed.sides)
      .map((side) => `<section class="paper" data-side="${side}">${placementBody(paper, side)}</section>`)
      .join(''),
  ).join('')
  return `<!doctype html><html${rootAttributes}><head><meta charset="utf-8"><style>@page{size:${mm(imposed.paper.width)} ${mm(imposed.paper.height)};margin:0}html,body{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.paper{width:${mm(imposed.paper.width)};height:${mm(imposed.paper.height)};position:relative;overflow:hidden;break-after:page}</style>${extraHead}</head><body>${papers}</body></html>`
}

function placementBox(
  inner: (dimensions: string) => string,
  placement: ReturnType<typeof impose>['placements'][number],
  layout: ReturnType<typeof pagePlacementLayout>,
  scale: number,
): string {
  const position = `left:${mm(layout.paper.x - placement.bleedBox.x)};top:${mm(layout.paper.y - placement.bleedBox.y)}`
  const dimensions =
    layout.kind === 'fluid'
      ? 'width:100%;height:100%'
      : `width:${layout.piece.width}px;height:${layout.piece.height}px;${position};transform:scale(${scale});transform-origin:0 0`
  return `<div class="placement" style="position:absolute;left:${mm(placement.bleedBox.x)};top:${mm(placement.bleedBox.y)};width:${mm(placement.bleedBox.width)};height:${mm(placement.bleedBox.height)};overflow:hidden">${inner(dimensions)}</div>`
}

export interface PrintableDeckDocument {
  html: string
  imposed: Imposed
}

export function printableDeckDocument(deck: Deck, options: PrintOptions & { imposition: ImpositionInput }): PrintableDeckDocument {
  if (options.layout === 'notes') {
    throw new RangeError("layout: 'notes' and imposition cannot be combined. Remove either layout: 'notes' or imposition to clear this refusal.")
  }
  const imposition = Imposition.parse(options.imposition)
  const imposed = impose(imposition, deck.slides.length)
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
  return { html: imposedPaperDocument(imposed, rootAttributes, placementBody, imageFitScript()), imposed }
}

function pageFrame(page: Page, imposition: Imposition, placement: ReturnType<typeof impose>['placements'][number], options: PrintablePagesOptions): string {
  const fit = fitPage(page, placement, imposition.fit)
  const layout = pagePlacementLayout(page.size, placement, fit)
  const properties = printProperties(imposition, imposition.unit)
  const padding = layout.inset ? printPadding(placement.bleed) : ''
  const srcdoc = frameDocument(page.html, {
    scripts: page.scripts,
    nonce: options.nonce ?? newNonce(),
    dir: page.dir,
    lang: page.lang,
    css: `${PRINT_COLOR_CSS}${properties}${padding}${options.css ?? ''}`,
    csp: options.cspExtra || undefined,
    reportHeight: false,
    relayKeys: false,
  })
  return placementBox(
    (dimensions) => `<iframe sandbox="allow-scripts" srcdoc="${escapeHtml(srcdoc)}" style="position:absolute;${dimensions};border:0;display:block"></iframe>`,
    placement,
    layout,
    fit.scale,
  )
}

// Builds only the positioned placement boxes for one physical paper, so the
// browser element and the print document use exactly the same frame markup.
export function printablePaper(
  pages: Page[],
  imposition: Imposition,
  imposed: Imposed,
  paper: number,
  options: PrintablePagesOptions = {},
  side: 'front' | 'back' = 'front',
): string {
  return imposed.placements
    .filter((placement) => placement.paper === paper && placement.side === side)
    .map((placement) => pageFrame(pages[placement.page] as Page, imposition, placement, options))
    .join('')
}

// This frame-based document is for a browser to show and print. Chromium loses
// backgrounds inside sandboxed frames when producing a PDF, so the server
// renderer composes top-level page renders instead of printing this document.
export function printablePagesDocument(pages: Page[], imposition: Imposition, options: PrintablePagesOptions = {}): PrintablePagesDocument {
  if (pages.length === 0) throw new RangeError('There is nothing to print. Pass at least one page to clear this refusal.')
  const imposed = impose(imposition, pages.length)
  // The document writes no text and uses physical paper positions, so its
  // direction is left to right; each page keeps its own direction in its frame.
  const html = imposedPaperDocument(imposed, ' dir="ltr"', (paper, side) => printablePaper(pages, imposition, imposed, paper, options, side))
  return { html, imposed }
}

export function printablePages(pages: Page[], imposition: Imposition, options: PrintablePagesOptions = {}): string {
  return printablePagesDocument(pages, imposition, options).html
}
