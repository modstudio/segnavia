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

// Notes are measured in their real print document. The first pass makes the
// document usable immediately; the font-ready pass corrects any changed wraps.
function paginationScript(): string {
  return `<script>(function(){
var originals=Array.from(document.querySelectorAll('[data-notes-source]')).map(function(sheet){return {sheet:sheet,text:sheet.querySelector('.notes').textContent||''};});
function fits(node,text){node.textContent=text;return node.scrollHeight<=node.clientHeight+1;}
function take(node,text){if(fits(node,text))return text.length;var low=0,high=text.length;while(low<high){var middle=Math.ceil((low+high)/2);if(fits(node,text.slice(0,middle)))low=middle;else high=middle-1;}var end=low;if(end>0&&end<text.length){var space=text.slice(0,end).search(/\\s+\\S*$/);if(space>0)end=space;}if(end===0)end=1;node.textContent=text.slice(0,end);return end;}
function continuation(owner,number){var sheet=document.createElement('section');sheet.className='sheet continuation';sheet.dataset.slideIndex=owner;sheet.dataset.notesContinuation='';var marker=document.createElement('p');marker.className='number';marker.textContent=number+' (continued)';var notes=document.createElement('div');notes.className='notes';notes.dir='auto';sheet.append(marker,notes);return sheet;}
function paginate(){document.querySelectorAll('[data-notes-continuation]').forEach(function(sheet){sheet.remove();});originals.forEach(function(item){var sheet=item.sheet;var notes=sheet.querySelector('.notes');var rest=item.text;var used=take(notes,rest);rest=rest.slice(used);var after=sheet;while(rest){var next=continuation(sheet.dataset.slideIndex,sheet.dataset.slideNumber);after.after(next);after=next;notes=next.querySelector('.notes');used=take(notes,rest);rest=rest.slice(used);}});}
paginate();window.segnaviaNotesReady=(document.fonts?document.fonts.ready:Promise.resolve()).then(paginate);
})();</script>`
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
  return `<!doctype html><html ${root}><head><meta charset="utf-8"><style>${css}</style></head><body>${sheets.join('')}${paginationScript()}</body></html>`
}
