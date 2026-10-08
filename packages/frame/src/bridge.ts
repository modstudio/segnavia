// The document a frame shows: the author's HTML behind a policy and a small
// bridge of our own. The frame is always sandboxed without same-origin, so it
// cannot reach its host. When the author's scripts are refused, a CSP that
// admits only our nonce keeps them from running while the bridge still can:
// a key pressed inside a slide still pages the deck, a fluid page still
// reports its height, and print still learns when the slide is painted.
//
// Pure string building, so the browser and a server produce the same bytes.

import type { Scripts } from '@segnavia/format'

export const MESSAGE = {
  key: 'segnavia:key',
  height: 'segnavia:height',
  ready: 'segnavia:ready',
} as const

// Only these leave the frame, and only by name: nothing else about a
// keystroke crosses. Escape rides with them so full screen can be left while
// the slide holds focus.
export const RELAYED_KEYS = ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Escape', ' '] as const

export interface FrameOptions {
  scripts: Scripts
  nonce: string
  dir?: 'ltr' | 'rtl' | 'auto'
  lang?: string
  // Styles the host applies to every document it shows, such as its house style.
  css?: string
  // Extra CSP directives, appended to the frame's own.
  csp?: string
  relayKeys?: boolean
  reportHeight?: boolean
}

// The bridge is written to run in old engines too: it is the one script that
// runs inside every author's document. Height is the root element's box,
// because scrollHeight is never less than the frame's own viewport and a
// frame would then never shrink to a short page. Reports are batched with a
// timer, not an animation frame: a browser may stop animation frames in a
// cross-origin frame that is off screen, and the report would never be sent.
function bridgeScript(options: FrameOptions): string {
  const keys = options.relayKeys === false ? '[]' : JSON.stringify(RELAYED_KEYS)
  return `(function(){
var post=function(m){parent.postMessage(m,'*')};
var keys=${keys};
document.addEventListener('keydown',function(e){if(keys.indexOf(e.key)!==-1){post({type:'${MESSAGE.key}',key:e.key});}});
${
  options.reportHeight === false
    ? ''
    : `var pending=false;function send(){pending=false;post({type:'${MESSAGE.height}',height:Math.ceil(document.documentElement.getBoundingClientRect().height)});}
function report(){if(pending)return;pending=true;setTimeout(send,0);}
if(window.ResizeObserver){new ResizeObserver(report).observe(document.documentElement);}
document.addEventListener('DOMContentLoaded',report);window.addEventListener('load',report);`
}
function ready(){var imgs=Array.prototype.slice.call(document.images).map(function(i){return i.decode?i.decode().catch(function(){}):null;});
Promise.all(imgs.concat([document.fonts?document.fonts.ready:null])).then(function(){post({type:'${MESSAGE.ready}'});});}
if(document.readyState==='complete'){ready();}else{window.addEventListener('load',ready);}
})();`
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

// Each block of text reads in the direction of its own first letter, so an
// English sentence on a right-to-left page keeps its full stop on the right.
// The page's own dir still lays out the page and decides a block with no
// letters. Zero specificity, so an author's dir or CSS always wins.
export const BLOCK_DIRECTION_CSS =
  ':where(p,li,dt,dd,h1,h2,h3,h4,h5,h6,blockquote,figcaption,caption,td,th,summary,label,pre,div,section,article,aside,address){unicode-bidi:plaintext}'

// The policy and the bridge go first, before anything the author wrote, so
// nothing in the author's document is parsed ahead of them. A policy the
// author adds can only narrow this one: browsers enforce every policy present.
export function frameDocument(html: string, options: FrameOptions): string {
  const body = html.replace(/^\s*<!doctype[^>]*>/i, '')
  const directives = [
    options.scripts === 'refuse' ? `script-src 'nonce-${options.nonce}'` : null,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    options.csp ?? null,
  ].filter(Boolean)
  const head = [
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(directives.join('; '))}">`,
    `<script nonce="${options.nonce}">${bridgeScript(options)}</script>`,
    `<style>${BLOCK_DIRECTION_CSS}</style>`,
    options.css ? `<style>${options.css}</style>` : '',
  ].join('')
  const attributes = [options.dir ? ` dir="${options.dir}"` : '', options.lang ? ` lang="${escapeAttribute(options.lang)}"` : ''].join('')
  // dir and lang go on a wrapper only when the author's document has no root
  // of its own to carry them; otherwise they are set on the root it declares.
  const withRoot = /<html[\s>]/i.test(body)
    ? body.replace(/<html(\s[^>]*)?>/i, (tag) => (attributes ? tag.replace(/>$/, `${attributes}>`) : tag))
    : `<html${attributes}><body>${body}</body></html>`
  return `<!doctype html>${head}${withRoot}`
}

// A fresh nonce per document, so an author cannot copy one into their page.
export function newNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// For a host serving slide HTML from its own URL: the same bridge, as a script
// it can include under its own CSP nonce.
export function bridgeForHost(options: Omit<FrameOptions, 'scripts' | 'nonce'> = {}): string {
  return bridgeScript({ ...options, scripts: 'sandboxed', nonce: '' })
}

// Our frame is identified by the window a message came from, which a page
// cannot forge. `origin` is "null" for every sandboxed frame and proves nothing.
export function messageFrom(event: MessageEvent, frame: HTMLIFrameElement | null): { type: string; key?: string; height?: number } | null {
  if (!frame || event.source !== frame.contentWindow) return null
  const data = event.data as { type?: unknown; key?: unknown; height?: unknown }
  if (data?.type === MESSAGE.key && typeof data.key === 'string' && (RELAYED_KEYS as readonly string[]).includes(data.key))
    return { type: MESSAGE.key, key: data.key }
  if (data?.type === MESSAGE.height && typeof data.height === 'number' && Number.isFinite(data.height)) return { type: MESSAGE.height, height: data.height }
  if (data?.type === MESSAGE.ready) return { type: MESSAGE.ready }
  return null
}
