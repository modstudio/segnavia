import { type Deck, Print, type PrintInput, PX_PER_MM, resolveDirection, type Slide, sheetMm } from '@segnavia/format'
import { notesSheetFontFamily } from './page-fonts.ts'
import { escapeHtml } from './svg.ts'

export const NOTES_PAPER: PrintInput = { paper: 'letter', orientation: 'portrait' }

export interface NotesLayoutGeometry {
  sheet: { width: number; height: number }
  border: number
  slide: { x: number; y: number; width: number; height: number; scale: number }
}

const FIRST_SHEET_NOTES_SPACE = 128

export function notesLayoutGeometry(size: Deck['size'], notesPaper: PrintInput = NOTES_PAPER): NotesLayoutGeometry {
  const paper = sheetMm(Print.parse(notesPaper))
  const sheet = { width: paper.width * PX_PER_MM, height: paper.height * PX_PER_MM }
  const margin = 48
  const border = 1
  const widthScale = (sheet.width - margin * 2) / size.width
  const heightScale = (sheet.height - margin * 2 - border * 2 - FIRST_SHEET_NOTES_SPACE) / size.height
  const scale = Math.min(widthScale, heightScale)
  return { sheet, border, slide: { x: margin + border, y: margin + border, width: size.width * scale, height: size.height * scale, scale } }
}

export function speakerNotes(slide: Pick<Slide, 'notes' | 'narration'>): string {
  return slide.notes ?? slide.narration?.text ?? ''
}

export interface NotesDocumentOptions {
  notesPaper?: PrintInput
  slideBody: (slide: Slide) => string
  title?: string
  labels?: { noSpeakerNotes?: string }
  notesFont?: string
  fontCss?: string
}

export interface NotesPaginationResult {
  sheets: number
  exceeded: boolean
}

// This function touches the DOM only when called with a document, so importing
// this module remains safe in the server renderer.
export function paginateNotes(target: Document | null, maxSheets?: number): NotesPaginationResult {
  const printDocument = target ?? document
  const fits = (node: HTMLElement, text: string) => {
    node.textContent = text
    return node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1
  }
  const take = (node: HTMLElement, text: string) => {
    const boundariesThrough = (length: number) => {
      const prefix = text.slice(0, length)
      const boundaries = [0]
      if (typeof Intl.Segmenter === 'function') {
        for (const part of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(prefix)) boundaries.push(part.index + part.segment.length)
      } else {
        let offset = 0
        for (const point of prefix) {
          offset += point.length
          boundaries.push(offset)
        }
      }
      if (length < text.length) boundaries.pop()
      return boundaries
    }
    let prefixLength = Math.min(1024, text.length)
    let boundaries = boundariesThrough(prefixLength)
    while (boundaries.length === 1 || fits(node, text.slice(0, boundaries.at(-1)))) {
      if (prefixLength === text.length) return text.length
      prefixLength = Math.min(prefixLength * 2, text.length)
      boundaries = boundariesThrough(prefixLength)
    }
    let low = 0
    let high = boundaries.length - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (fits(node, text.slice(0, boundaries[middle]))) low = middle
      else high = middle - 1
    }
    let end = boundaries[low] ?? 0
    if (end > 0 && end < text.length) {
      const space = text.slice(0, end).search(/\s+\S*$/)
      if (space > 0) end = space
    }
    node.textContent = text.slice(0, end)
    return end
  }
  const continuation = (owner: string, number: string) => {
    const sheet = printDocument.createElement('section')
    sheet.className = 'sheet continuation'
    sheet.dataset.slideIndex = owner
    sheet.dataset.notesContinuation = ''
    const marker = printDocument.createElement('p')
    marker.className = 'number'
    const label = printDocument.createElement('bdi')
    label.dir = 'ltr'
    label.textContent = `${number} (continued)`
    marker.append(label)
    const notes = printDocument.createElement('div')
    notes.className = 'notes'
    notes.dir = 'auto'
    sheet.append(marker, notes)
    return sheet
  }

  printDocument.querySelectorAll('[data-notes-continuation]').forEach((sheet) => {
    sheet.remove()
  })
  let sheets = printDocument.querySelectorAll('[data-notes-source]').length
  if (maxSheets !== undefined && sheets > maxSheets) return { sheets, exceeded: true }
  let exceeded = false
  printDocument.querySelectorAll<HTMLElement>('[data-notes-source]').forEach((sheet) => {
    if (exceeded) return
    const notes = sheet.querySelector<HTMLElement>('.notes')
    if (!notes) return
    const source = sheet.dataset.notesText ?? notes.textContent ?? ''
    sheet.dataset.notesText = source
    let rest = source
    let used = take(notes, rest)
    rest = rest.slice(used)
    let after = sheet
    while (rest) {
      if (maxSheets !== undefined && sheets >= maxSheets) {
        exceeded = true
        return
      }
      const next = continuation(sheet.dataset.slideIndex ?? '', sheet.dataset.slideNumber ?? '')
      after.after(next)
      after = next
      sheets++
      const continuationNotes = next.querySelector<HTMLElement>('.notes') as HTMLElement
      used = take(continuationNotes, rest)
      if (used === 0) throw new RangeError('The notes paper has no visible area for speaker notes.')
      rest = rest.slice(used)
    }
  })
  return { sheets, exceeded }
}

export function notesDocument(deck: Deck, options: NotesDocumentOptions): string {
  const paper = sheetMm(Print.parse(options.notesPaper ?? NOTES_PAPER))
  const geometry = notesLayoutGeometry(deck.size, options.notesPaper)
  const { width: sheetWidth, height: sheetHeight } = geometry.sheet
  const { x, width: slideWidth, height: slideHeight, scale } = geometry.slide
  const padding = x - geometry.border
  const someHaveNotes = deck.slides.some((slide) => speakerNotes(slide) !== '')
  // Empty-slide copy lives in the notes box, so dir=auto follows the label.
  const emptyNotes = someHaveNotes ? (options.labels?.noSpeakerNotes ?? 'No speaker notes') : ''
  const sheets = deck.slides.map((slide, index) => {
    const number = index + 1
    const notes = speakerNotes(slide) || emptyNotes
    return `<section class="sheet" data-notes-source data-slide-index="${index}" data-slide-number="${number}"><div class="slide" dir="ltr" style="width:${slideWidth}px;height:${slideHeight}px"><div style="width:${deck.size.width}px;height:${deck.size.height}px;transform:scale(${scale});transform-origin:0 0">${options.slideBody(slide)}</div></div><p class="number"><bdi dir="ltr">${number}</bdi></p><div class="notes" dir="auto">${escapeHtml(notes)}</div></section>`
  })
  const root = `dir="${resolveDirection(deck.dir, deck.lang, deck.title)}"${deck.lang ? ` lang="${escapeHtml(deck.lang)}"` : ''}`
  const title = options.title ? `<title>${escapeHtml(options.title)}</title>` : ''
  const family = notesSheetFontFamily(options.notesFont)
  const css = `${options.fontCss ?? ''}@page{size:${paper.width}mm ${paper.height}mm;margin:0}html,body{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.sheet{width:${sheetWidth}px;height:${sheetHeight}px;box-sizing:border-box;padding:${padding}px;overflow:hidden;break-after:page;font:15px/1.5 ${family};display:flex;flex-direction:column}.slide{border:${geometry.border}px solid #ccc;overflow:hidden;flex:none}.number{color:#777;margin:12px 0 4px;flex:none}.notes{min-height:0;flex:1;overflow:hidden;overflow-wrap:anywhere;white-space:pre-wrap}.continuation .number{margin:0 0 4px}`
  return `<!doctype html><html ${root}><head><meta charset="utf-8">${title}<style>${css}</style></head><body>${sheets.join('')}</body></html>`
}
