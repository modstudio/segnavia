// The frame-based print document a browser shows and prints.
// One sheet per slide: a playing slide prints its picture with every
// annotation shown, and its narration prints as its notes.

import {
  type Deck,
  fitPage,
  type Imposed,
  type Imposition,
  impose,
  type Page,
  Print,
  type PrintInput,
  PX_PER_MM,
  pagePlacementLayout,
  printPadding,
  printProperties,
  resolveDirection,
  type Slide,
  sheetMm,
} from '@segnavia/format'
import { frameDocument, newNonce } from './bridge.ts'
import { annotationSvg, escapeHtml } from './svg.ts'

export interface PrintOptions {
  // `slides` prints each slide on a sheet of its own size; `notes` prints it
  // on paper with its notes underneath.
  layout?: 'slides' | 'notes'
  notesPaper?: PrintInput
  // Turns an image a slide names by path into something the printing context
  // can load. A server rendering offline passes a data URL.
  inline?: (src: string) => string
  css?: string
  nonce?: string
  // Keeps every HTML slide's layout box but leaves its frame out.
  omitHtmlSlideFrames?: boolean
}

export const NOTES_PAPER: PrintInput = { paper: 'letter', orientation: 'portrait' }

export interface NotesLayoutGeometry {
  sheet: { width: number; height: number }
  border: number
  slide: { x: number; y: number; width: number; height: number; scale: number }
}

export function notesLayoutGeometry(size: Deck['size'], notesPaper: PrintInput = NOTES_PAPER): NotesLayoutGeometry {
  const paper = sheetMm(Print.parse(notesPaper))
  const sheet = { width: paper.width * PX_PER_MM, height: paper.height * PX_PER_MM }
  const margin = 48
  const border = 1
  const scale = (sheet.width - margin * 2) / size.width
  return { sheet, border, slide: { x: margin + border, y: margin + border, width: size.width * scale, height: size.height * scale, scale } }
}

export function htmlSlideDocument(deck: Pick<Deck, 'scripts' | 'dir' | 'lang'>, html: string, options: { css?: string; nonce: string }): string {
  return frameDocument(html, {
    scripts: deck.scripts,
    nonce: options.nonce,
    dir: deck.dir,
    lang: deck.lang,
    css: options.css,
    reportHeight: false,
    relayKeys: false,
  })
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
      return `<img src="${escapeHtml(inline(content.src))}" alt="${escapeHtml(content.alt)}" style="width:${width}px;height:${height}px;object-fit:contain;display:block">`
    case 'shot':
      return `<div style="position:relative;width:${width}px;height:${height}px"><img src="${escapeHtml(inline(content.src))}" alt="${escapeHtml(content.shot.title)}" style="width:100%;height:100%;object-fit:contain;display:block">${annotationSvg(content.shot.size, content.shot.annotations)}</div>`
    case 'shot-ref':
      throw new Error(`Slide "${slide.id}" names its shot by reference; resolve it before printing (resolveShots).`)
  }
}

export function printableDeck(deck: Deck, options: PrintOptions = {}): string {
  const { width, height } = deck.size
  if ((options.layout ?? 'slides') === 'slides') {
    const sheets = deck.slides.map((slide) => `<section class="sheet">${slideBody(deck, slide, options)}</section>`)
    return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${width}px ${height}px;margin:0}html,body{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.sheet{width:${width}px;height:${height}px;overflow:hidden;break-after:page}</style></head><body>${sheets.join('')}</body></html>`
  }
  const paper = sheetMm(Print.parse(options.notesPaper ?? NOTES_PAPER))
  const geometry = notesLayoutGeometry(deck.size, options.notesPaper)
  const { width: sheetWidth, height: sheetHeight } = geometry.sheet
  const { x, width: slideWidth, height: slideHeight, scale } = geometry.slide
  const padding = x - geometry.border
  // The thumbnail is laid out left to right whatever the deck's direction: it
  // is scaled from its top-left corner, and the slide inside keeps its own.
  const sheets = deck.slides.map((slide, index) => {
    const notes = slide.narration?.text ?? slide.notes ?? ''
    return `<section class="sheet"><div class="slide" dir="ltr" style="width:${slideWidth}px;height:${slideHeight}px"><div style="width:${width}px;height:${height}px;transform:scale(${scale});transform-origin:0 0">${slideBody(deck, slide, options)}</div></div><p class="number">${index + 1}</p><div class="notes" dir="auto">${escapeHtml(notes)}</div></section>`
  })
  return `<!doctype html><html dir="${resolveDirection(deck.dir, deck.lang, deck.title)}"${deck.lang ? ` lang="${escapeHtml(deck.lang)}"` : ''}><head><meta charset="utf-8"><style>@page{size:${paper.width}mm ${paper.height}mm;margin:0}html,body{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.sheet{width:${sheetWidth}px;height:${sheetHeight}px;box-sizing:border-box;padding:${padding}px;overflow:hidden;break-after:page;font:15px/1.5 system-ui,sans-serif}.slide{border:${geometry.border}px solid #ccc;overflow:hidden}.number{color:#777;margin:12px 0 4px}.notes{white-space:pre-wrap}</style></head><body>${sheets.join('')}</body></html>`
}

export interface PrintablePagesOptions {
  css?: string
  nonce?: string
  cspExtra?: string
}

const mm = (value: number) => `${value}mm`

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
    css: `${properties}${padding}${options.css ?? ''}`,
    csp: options.cspExtra || undefined,
    reportHeight: false,
    relayKeys: false,
  })
  const position = `left:${mm(layout.paper.x - placement.bleedBox.x)};top:${mm(layout.paper.y - placement.bleedBox.y)}`
  const dimensions =
    layout.kind === 'fluid'
      ? 'width:100%;height:100%'
      : `width:${layout.piece.width}px;height:${layout.piece.height}px;${position};transform:scale(${fit.scale});transform-origin:0 0`
  return `<div class="placement" style="position:absolute;left:${mm(placement.bleedBox.x)};top:${mm(placement.bleedBox.y)};width:${mm(placement.bleedBox.width)};height:${mm(placement.bleedBox.height)};overflow:hidden"><iframe sandbox="allow-scripts" srcdoc="${escapeHtml(srcdoc)}" style="position:absolute;${dimensions};border:0;display:block"></iframe></div>`
}

// Builds only the positioned placement boxes for one physical paper, so the
// browser element and the print document use exactly the same frame markup.
export function printablePaper(pages: Page[], imposition: Imposition, imposed: Imposed, paper: number, options: PrintablePagesOptions = {}): string {
  return imposed.placements
    .filter((placement) => placement.paper === paper)
    .map((placement) => pageFrame(pages[placement.page] as Page, imposition, placement, options))
    .join('')
}

// This frame-based document is for a browser to show and print. Chromium loses
// backgrounds inside sandboxed frames when producing a PDF, so the server
// renderer composes top-level page renders instead of printing this document.
export function printablePages(pages: Page[], imposition: Imposition, options: PrintablePagesOptions = {}): string {
  if (pages.length === 0) throw new RangeError('There is nothing to print. Pass at least one page to clear this refusal.')
  const imposed = impose(imposition, pages.length)
  const papers = Array.from(
    { length: imposed.papers },
    (_, paper) => `<section class="paper">${printablePaper(pages, imposition, imposed, paper, options)}</section>`,
  ).join('')
  // The document writes no text and uses physical paper positions, so its
  // direction is left to right; each page keeps its own direction in its frame.
  return `<!doctype html><html dir="ltr"><head><meta charset="utf-8"><style>@page{size:${mm(imposed.paper.width)} ${mm(imposed.paper.height)};margin:0}html,body{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.paper{width:${mm(imposed.paper.width)};height:${mm(imposed.paper.height)};position:relative;overflow:hidden;break-after:page}</style></head><body>${papers}</body></html>`
}
