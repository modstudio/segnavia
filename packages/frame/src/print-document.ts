// One print document for a deck, used by a browser printing it and by a
// server rendering it to PDF, so the two can never lay a deck out differently.
// One sheet per slide: a playing slide prints its picture with every
// annotation shown, and its narration prints as its notes.

import {
  type Deck,
  fitPage,
  type Imposition,
  impose,
  type Page,
  Print,
  type PrintInput,
  PX_PER_MM,
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
}

export const NOTES_PAPER: PrintInput = { paper: 'letter', orientation: 'portrait' }

function slideBody(deck: Deck, slide: Slide, options: PrintOptions): string {
  const { width, height } = deck.size
  const inline = options.inline ?? ((src: string) => src)
  const content = slide.content
  const frame = (html: string) =>
    `<iframe sandbox="allow-scripts" srcdoc="${escapeHtml(frameDocument(html, { scripts: deck.scripts, nonce: options.nonce ?? newNonce(), dir: deck.dir, lang: deck.lang, css: options.css, reportHeight: false, relayKeys: false }))}" style="width:${width}px;height:${height}px;border:0;display:block"></iframe>`
  switch (content.kind) {
    case 'html':
      return frame(content.html)
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
  const sheetWidth = paper.width * PX_PER_MM
  const sheetHeight = paper.height * PX_PER_MM
  const margin = 48
  const scale = (sheetWidth - margin * 2) / width
  // The thumbnail is laid out left to right whatever the deck's direction: it
  // is scaled from its top-left corner, and the slide inside keeps its own.
  const sheets = deck.slides.map((slide, index) => {
    const notes = slide.narration?.text ?? slide.notes ?? ''
    return `<section class="sheet"><div class="slide" dir="ltr" style="width:${width * scale}px;height:${height * scale}px"><div style="width:${width}px;height:${height}px;transform:scale(${scale});transform-origin:0 0">${slideBody(deck, slide, options)}</div></div><p class="number">${index + 1}</p><div class="notes" dir="auto">${escapeHtml(notes)}</div></section>`
  })
  return `<!doctype html><html dir="${resolveDirection(deck.dir, deck.lang, deck.title)}"${deck.lang ? ` lang="${escapeHtml(deck.lang)}"` : ''}><head><meta charset="utf-8"><style>@page{size:${paper.width}mm ${paper.height}mm;margin:0}html,body{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.sheet{width:${sheetWidth}px;height:${sheetHeight}px;box-sizing:border-box;padding:${margin}px;overflow:hidden;break-after:page;font:15px/1.5 system-ui,sans-serif}.slide{border:1px solid #ccc;overflow:hidden}.number{color:#777;margin:12px 0 4px}.notes{white-space:pre-wrap}</style></head><body>${sheets.join('')}</body></html>`
}

export interface PrintablePagesOptions {
  css?: string
  nonce?: string
}

const mm = (value: number) => `${value}mm`

function pageFrame(page: Page, imposition: Imposition, placement: ReturnType<typeof impose>['placements'][number], options: PrintablePagesOptions): string {
  const fit = fitPage(page, placement, imposition.fit)
  const properties = printProperties(imposition, imposition.unit)
  const padding = fit.flow && page.size === 'fluid' ? printPadding(placement.bleed) : ''
  const srcdoc = frameDocument(page.html, {
    scripts: page.scripts,
    nonce: options.nonce ?? newNonce(),
    dir: page.dir,
    lang: page.lang,
    css: `${properties}${padding}${options.css ?? ''}`,
    reportHeight: false,
    relayKeys: false,
  })
  const position = `left:${mm(fit.x - placement.bleedBox.x)};top:${mm(fit.y - placement.bleedBox.y)}`
  const dimensions =
    page.size === 'fluid'
      ? 'width:100%;height:100%'
      : `width:${fit.width}px;height:${fit.height ?? (placement.trim.height * PX_PER_MM) / fit.scale}px;${position};transform:scale(${fit.scale});transform-origin:0 0`
  return `<div class="placement" style="position:absolute;left:${mm(placement.bleedBox.x)};top:${mm(placement.bleedBox.y)};width:${mm(placement.bleedBox.width)};height:${mm(placement.bleedBox.height)};overflow:hidden"><iframe sandbox="allow-scripts" srcdoc="${escapeHtml(srcdoc)}" style="position:absolute;${dimensions};border:0;display:block"></iframe></div>`
}

// This frame-based document is for a browser to show and print. Chromium loses
// backgrounds inside sandboxed frames when producing a PDF, so the server
// renderer composes top-level page renders instead of printing this document.
export function printablePages(pages: Page[], imposition: Imposition, options: PrintablePagesOptions = {}): string {
  if (pages.length === 0) throw new RangeError('There is nothing to print.')
  const imposed = impose(imposition, pages.length)
  const papers = Array.from({ length: imposed.papers }, (_, paper) => {
    const frames = imposed.placements
      .filter((placement) => placement.paper === paper)
      .map((placement) => pageFrame(pages[placement.page] as Page, imposition, placement, options))
      .join('')
    return `<section class="paper">${frames}</section>`
  }).join('')
  // The document writes no text and uses physical paper positions, so its
  // direction is left to right; each page keeps its own direction in its frame.
  return `<!doctype html><html dir="ltr"><head><meta charset="utf-8"><style>@page{size:${mm(imposed.paper.width)} ${mm(imposed.paper.height)};margin:0}html,body{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.paper{width:${mm(imposed.paper.width)};height:${mm(imposed.paper.height)};position:relative;overflow:hidden;break-after:page}</style></head><body>${papers}</body></html>`
}
