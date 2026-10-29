import { embedFunction, parseBookPositionKey } from '@segnavia/html'
import { MESSAGE } from './bridge.ts'

export const BOOK_LAYOUTS = ['pages', 'flow'] as const

export type BookLayout = (typeof BOOK_LAYOUTS)[number]

export const BOOK_PLACE_KEY_LIMIT = 256

export interface VisibleBookBlock {
  key: string
  top: number
  bottom: number
}

export interface BookBlockTarget {
  key: string
  top: number
}

export function bookPlace(blocks: VisibleBookBlock[]): string | undefined {
  return blocks.find((block) => block.bottom > 0)?.key
}

export function bookPlaceOffset(blocks: BookBlockTarget[], key: string): number {
  const exact = blocks.find((block) => block.key === key)
  if (exact) return exact.top

  const wanted = parseBookPositionKey(key)
  if (!wanted) return 0
  let sameFlow: BookBlockTarget | undefined
  const flowOrder: string[] = []
  for (const block of blocks) {
    const held = parseBookPositionKey(block.key)
    if (!held) continue
    if (!flowOrder.includes(held.flow)) flowOrder.push(held.flow)
    const preceding = held.index < wanted.index || (wanted.suffix !== undefined && held.index === wanted.index && held.suffix === undefined)
    if (held.flow === wanted.flow && preceding) sameFlow = block
  }
  if (sameFlow) return sameFlow.top

  const flowIndex = flowOrder.indexOf(wanted.flow)
  if (flowIndex < 1) return 0
  let earlier: BookBlockTarget | undefined
  for (const block of blocks) {
    const held = parseBookPositionKey(block.key)
    if (held && flowOrder.indexOf(held.flow) < flowIndex) earlier = block
  }
  return earlier?.top ?? 0
}

export function bookPlaceKey(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= BOOK_PLACE_KEY_LIMIT && parseBookPositionKey(value) ? value : undefined
}

export function embeddedBookPresentationFunctions(): string {
  return `${embedFunction('parseBookPositionKey', parseBookPositionKey)}
${embedFunction('bookPlace', bookPlace)}
${embedFunction('bookPlaceOffset', bookPlaceOffset)}
var BOOK_PLACE_KEY_LIMIT=${BOOK_PLACE_KEY_LIMIT};
${embedFunction('bookPlaceKey', bookPlaceKey)}`
}

export function bookPresentationScript(root: string): string {
  return `var bookRoot=${root};
var visibleBookBlocks=function(){var nodes=bookRoot.querySelectorAll('[data-segnavia-position]');var blocks=[];for(var i=0;i<nodes.length;i++){var box=nodes[i].getBoundingClientRect();var clip=nodes[i].closest('[data-segnavia-window],[data-segnavia-book-page]');var clipped=clip?clip.getBoundingClientRect():box;blocks.push({key:nodes[i].getAttribute('data-segnavia-position')||'',top:Math.max(box.top,clipped.top),bottom:Math.min(box.bottom,clipped.bottom)});}return blocks;};
var targetBookBlocks=function(){var nodes=bookRoot.querySelectorAll('[data-segnavia-position]');var blocks=[];for(var i=0;i<nodes.length;i++){var box=nodes[i].getBoundingClientRect();blocks.push({key:nodes[i].getAttribute('data-segnavia-position')||'',top:box.top+scrollY});}return blocks;};
var reportBookPlace=function(){var key=bookPlace(visibleBookBlocks());if(bookPlaceKey(key)!==undefined)parent.postMessage({type:'${MESSAGE.bookPlace}',key:key},'*');};
var bookPlacePending=false;var scheduleBookPlace=function(){if(bookPlacePending)return;bookPlacePending=true;setTimeout(function(){bookPlacePending=false;reportBookPlace();},50);};
var settleBookPlace=function(key){scrollTo(0,key?bookPlaceOffset(targetBookBlocks(),key):0);var report=function(){if(window.requestAnimationFrame)window.requestAnimationFrame(reportBookPlace);else setTimeout(reportBookPlace,0);};if(window.requestAnimationFrame)window.requestAnimationFrame(report);else setTimeout(report,0);};
window.addEventListener('scroll',scheduleBookPlace,{passive:true});
window.addEventListener('message',function(event){var data=event.data;if(event.source!==parent||!data||data.type!=='${MESSAGE.bookLayout}'||BOOK_LAYOUTS.indexOf(data.layout)<0)return;var place=data.place===undefined?undefined:bookPlaceKey(data.place);if(data.place!==undefined&&place===undefined)return;settleBookPlace(place);});
settleBookPlace();`
}

export function spreadSlots(pageCount: number): number {
  if (!Number.isSafeInteger(pageCount) || pageCount <= 0) return 0
  return pageCount + 1
}

export function pageScale(frameInline: number, paperInline: number, columns: number): number {
  if (![frameInline, paperInline, columns].every(Number.isFinite) || frameInline <= 0 || paperInline <= 0 || columns <= 0) return 0
  return Math.min(1, frameInline / (paperInline * columns))
}
