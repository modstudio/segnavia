import { type Deck, Print, type PrintInput, PX_PER_MM, resolveDirection, type Slide, sheetMm } from '@segnavia/format'
import { escapeHtml } from './svg.ts'

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

export function speakerNotes(slide: Pick<Slide, 'notes' | 'narration'>): string {
  return slide.notes ?? slide.narration?.text ?? ''
}

export interface NotesDocumentOptions {
  notesPaper?: PrintInput
  slideBody: (slide: Slide) => string
}

// This function touches the DOM only when called with a document, so importing
// this module remains safe in the server renderer.
export function paginateNotes(target: Document | null): void {
  const printDocument = target ?? document
  const fits = (node: HTMLElement, text: string) => {
    node.textContent = text
    return node.scrollHeight <= node.clientHeight + 1
  }
  const take = (node: HTMLElement, text: string) => {
    if (fits(node, text)) return text.length
    let low = 0
    let high = text.length
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (fits(node, text.slice(0, middle))) low = middle
      else high = middle - 1
    }
    let end = low
    if (end > 0 && end < text.length) {
      const space = text.slice(0, end).search(/\s+\S*$/)
      if (space > 0) end = space
    }
    if (end === 0) end = 1
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
    marker.textContent = `${number} (continued)`
    const notes = printDocument.createElement('div')
    notes.className = 'notes'
    notes.dir = 'auto'
    sheet.append(marker, notes)
    return sheet
  }

  printDocument.querySelectorAll('[data-notes-continuation]').forEach((sheet) => {
    sheet.remove()
  })
  printDocument.querySelectorAll<HTMLElement>('[data-notes-source]').forEach((sheet) => {
    const notes = sheet.querySelector<HTMLElement>('.notes')
    if (!notes) return
    const source = sheet.dataset.notesText ?? notes.textContent ?? ''
    sheet.dataset.notesText = source
    let rest = source
    let used = take(notes, rest)
    rest = rest.slice(used)
    let after = sheet
    while (rest) {
      const next = continuation(sheet.dataset.slideIndex ?? '', sheet.dataset.slideNumber ?? '')
      after.after(next)
      after = next
      const continuationNotes = next.querySelector<HTMLElement>('.notes') as HTMLElement
      used = take(continuationNotes, rest)
      rest = rest.slice(used)
    }
  })
}

export function notesDocument(deck: Deck, options: NotesDocumentOptions): string {
  const paper = sheetMm(Print.parse(options.notesPaper ?? NOTES_PAPER))
  const geometry = notesLayoutGeometry(deck.size, options.notesPaper)
  const { width: sheetWidth, height: sheetHeight } = geometry.sheet
  const { x, width: slideWidth, height: slideHeight, scale } = geometry.slide
  const padding = x - geometry.border
  const firstNotesHeight = sheetHeight - padding * 2 - slideHeight - geometry.border * 2 - 39
  const continuationNotesHeight = sheetHeight - padding * 2 - 27
  const sheets = deck.slides.map((slide, index) => {
    const number = index + 1
    return `<section class="sheet" data-notes-source data-slide-index="${index}" data-slide-number="${number}"><div class="slide" dir="ltr" style="width:${slideWidth}px;height:${slideHeight}px"><div style="width:${deck.size.width}px;height:${deck.size.height}px;transform:scale(${scale});transform-origin:0 0">${options.slideBody(slide)}</div></div><p class="number">${number}</p><div class="notes" dir="auto">${escapeHtml(speakerNotes(slide))}</div></section>`
  })
  const root = `dir="${resolveDirection(deck.dir, deck.lang, deck.title)}"${deck.lang ? ` lang="${escapeHtml(deck.lang)}"` : ''}`
  const css = `@page{size:${paper.width}mm ${paper.height}mm;margin:0}html,body{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.sheet{width:${sheetWidth}px;height:${sheetHeight}px;box-sizing:border-box;padding:${padding}px;overflow:hidden;break-after:page;font:15px/1.5 system-ui,sans-serif}.slide{border:${geometry.border}px solid #ccc;overflow:hidden}.number{color:#777;margin:12px 0 4px}.notes{height:${firstNotesHeight}px;overflow:hidden;white-space:pre-wrap}.continuation .number{margin:0 0 4px}.continuation .notes{height:${continuationNotesHeight}px}`
  return `<!doctype html><html ${root}><head><meta charset="utf-8"><style>${css}</style></head><body>${sheets.join('')}</body></html>`
}
