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

export const PRINT_READY_ATTRIBUTE = 'data-segnavia-print-ready'

// Only these leave the frame, and only by name: nothing else about a
// keystroke crosses. Escape rides with them so full screen can be left while
// the slide holds focus.
export const RELAYED_KEYS = ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Escape', ' ', 'm', 'c', 'f'] as const

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
  // Set only for a print document, to freeze its animations and let authored
  // code draw the frame that will be printed.
  printAtMs?: number
  // Set only for a print document whose sandboxed frame must carry its root
  // background into the browser print pipeline.
  printBackground?: boolean
}

// The bridge is written to run in old engines too: it is the one script that
// runs inside every author's document. Height is the root element's box,
// because scrollHeight is never less than the frame's own viewport and a
// frame would then never shrink to a short page. Reports are batched with a
// timer, not an animation frame: a browser may stop animation frames in a
// cross-origin frame that is off screen, and the report would never be sent.
function bridgeScript(options: FrameOptions): string {
  const keys = options.relayKeys === false ? '[]' : JSON.stringify(RELAYED_KEYS)
  const print =
    options.printAtMs === undefined
      ? ''
      : `var printAt=${JSON.stringify(options.printAtMs)};
var freeze=function(){if(!document.getAnimations)return;document.documentElement.getBoundingClientRect();var animations=document.getAnimations();for(var j=0;j<animations.length;j++){try{animations[j].pause();animations[j].currentTime=printAt;}catch(error){}}};
document.addEventListener('animationstart',freeze,true);document.addEventListener('transitionrun',freeze,true);
var printWaits=[];
var waitUntil=function(promise){printWaits.push(Promise.resolve(promise).catch(function(){}));};
var dispatchPrint=function(){var detail={atMs:printAt,waitUntil:waitUntil};var event;if(typeof CustomEvent==='function'){event=new CustomEvent('segnavia:print',{detail:detail});}else{event=document.createEvent('CustomEvent');event.initCustomEvent('segnavia:print',false,false,detail);}window.dispatchEvent(event);};
var finishPrint=function(){freeze();document.documentElement.setAttribute('${PRINT_READY_ATTRIBUTE}','');post({type:'${MESSAGE.ready}'});};
var settlePrint=function(){if(!window.requestAnimationFrame){setTimeout(finishPrint,0);return;}var finished=false;var finish=function(){if(finished)return;finished=true;finishPrint();};var fallback=setTimeout(finish,50);window.requestAnimationFrame(function(){window.requestAnimationFrame(function(){clearTimeout(fallback);finish();});});};`
  const printBackground = options.printBackground
    ? `var printBackground=function(){
var root=document.documentElement;var body=document.body;if(!body)return;
var rootStyle=getComputedStyle(root);var bodyStyle=getComputedStyle(body);
var visible=function(style){return style.backgroundImage!=='none'||(style.backgroundColor!=='rgba(0, 0, 0, 0)'&&style.backgroundColor!=='transparent')};
var source=visible(rootStyle)?rootStyle:bodyStyle;if(!visible(source))return;
var layer=document.createElement('div');layer.setAttribute('data-segnavia-print-background','');
var names=['backgroundColor','backgroundImage','backgroundPosition','backgroundSize','backgroundRepeat','backgroundOrigin','backgroundClip','backgroundAttachment','backgroundBlendMode'];
for(var i=0;i<names.length;i++)layer.style[names[i]]=source[names[i]];
layer.style.position='fixed';layer.style.inset='0';layer.style.pointerEvents='none';layer.style.zIndex='-2147483647';
// Chromium omits the frame canvas background when printing. A negative layer
// in an isolated root paints the same computed background behind all content.
root.style.isolation='isolate';root.style.background='transparent';body.style.background='transparent';body.insertBefore(layer,body.firstChild);
};
var backgroundImages=function(){var elements=[document.documentElement,document.body].concat(Array.prototype.slice.call(document.querySelectorAll('*')));
var settle=function(element,pseudo){var style=getComputedStyle(element,pseudo);var value=style.backgroundImage;var pattern=/url\\((?:"([^"]*)"|'([^']*)'|([^)]*))\\)/g;var matches=[];var match;
while((match=pattern.exec(value))){var url=(match[1]||match[2]||match[3]||'').trim();if(url)matches.push({text:match[0],url:url});}
return Promise.all(matches.map(function(found){var image=new Image();image.src=found.url;var ready=image.decode?image.decode():new Promise(function(resolve,reject){if(image.complete){resolve();return;}image.onload=resolve;image.onerror=reject;});return ready.then(function(){
if(pseudo)return;found.width=image.naturalWidth;found.height=image.naturalHeight;found.data=found.url;
},function(){}); })).then(function(){if(pseudo||matches.length!==1||!matches[0].data)return;
// Chromium also omits CSS image resources in sandboxed-frame backgrounds, so
// a decoded resource becomes an equivalent image layer before readiness.
var image=document.createElement('img');image.src=matches[0].data;image.setAttribute('data-segnavia-print-background-image','');image.style.position='absolute';image.style.pointerEvents='none';image.style.zIndex='-1';
var size=style.backgroundSize.split(' ');var position=style.backgroundPosition.split(' ');var x=position[0]||'0%';var y=position[1]||'0%';
if(style.backgroundSize==='cover'||style.backgroundSize==='contain'){image.style.inset='0';image.style.width='100%';image.style.height='100%';image.style.objectFit=style.backgroundSize;image.style.objectPosition=x+' '+y;}else{image.style.width=size[0]==='auto'?matches[0].width+'px':size[0];image.style.height=(size[1]||size[0])==='auto'?matches[0].height+'px':(size[1]||size[0]);image.style.left=x;image.style.top=y;image.style.transform='translate('+(x.indexOf('%')<0?'0':('-'+x))+','+(y.indexOf('%')<0?'0':('-'+y))+')';}
if(getComputedStyle(element).position==='static')element.style.position='relative';if(style.zIndex==='auto')element.style.zIndex='0';element.style.isolation='isolate';element.style.backgroundImage='none';element.insertBefore(image,element.firstChild);return image.decode?image.decode().catch(function(){}):null;
});};
var waits=[];for(var i=0;i<elements.length;i++){if(!elements[i])continue;waits.push(settle(elements[i],null),settle(elements[i],'::before'),settle(elements[i],'::after'));}return waits;
};`
    : ''
  return `(function(){
var post=function(m){parent.postMessage(m,'*')};
var keys=${keys};
${print}
${printBackground}
var editable=function(t){return t&&(t.isContentEditable||t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT')};
var decodeFragment=function(value){return value.replace(/(?:%[0-9a-f]{2})+/gi,function(run){try{return decodeURIComponent(run);}catch(error){return run;}})};
document.addEventListener('keydown',function(e){var letter=e.key==='m'||e.key==='c'||e.key==='f';if(keys.indexOf(e.key)!==-1&&(!letter||!editable(e.target))){post({type:'${MESSAGE.key}',key:e.key});}});
window.addEventListener('click',function(e){
if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
var link=e.target;while(link&&link.tagName!=='A')link=link.parentElement;
if(!link||link.hasAttribute('target')||link.hasAttribute('download'))return;
var href=link.getAttribute('href');if(!href||href.charAt(0)!=='#')return;
var fragment=decodeFragment(href.slice(1));
var target=document.getElementById(fragment);
if(!target){var named=document.getElementsByTagName('a');for(var i=0;i<named.length;i++){if(named[i].getAttribute('name')===fragment){target=named[i];break;}}}
e.preventDefault();
if(!target&&(fragment===''||fragment.toLowerCase()==='top')){scrollTo(0,0);return;}
if(!target)return;target.scrollIntoView();
if(target.focus){target.focus({preventScroll:true});if(document.activeElement!==target){if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}}
});
${
  options.reportHeight === false
    ? ''
    : `var pending=false;function send(){pending=false;post({type:'${MESSAGE.height}',height:Math.ceil(document.documentElement.getBoundingClientRect().height)});}
function report(){if(pending)return;pending=true;setTimeout(send,0);}
if(window.ResizeObserver){new ResizeObserver(report).observe(document.documentElement);}
document.addEventListener('DOMContentLoaded',report);window.addEventListener('load',report);`
}
function ready(){${options.printBackground ? 'printBackground();' : ''}var imgs=Array.prototype.slice.call(document.images).map(function(i){return i.decode?i.decode().catch(function(){}):null;});${options.printBackground ? 'imgs=imgs.concat(backgroundImages());' : ''}
${options.printAtMs === undefined ? '' : 'freeze();dispatchPrint();'}
Promise.all(imgs.concat([document.fonts?document.fonts.ready:null]${options.printAtMs === undefined ? '' : ',printWaits'})).then(function(){${options.printAtMs === undefined ? `post({type:'${MESSAGE.ready}'});` : 'settlePrint();'}});}
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
    options.printAtMs === undefined ? '' : '<style>*,*::before,*::after{animation-play-state:paused!important}</style>',
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
export function messageFrom(
  event: MessageEvent,
  frame: HTMLIFrameElement | Iterable<HTMLIFrameElement> | null,
): { type: string; key?: string; height?: number } | null {
  const frames = frame && Symbol.iterator in Object(frame) ? [...(frame as Iterable<HTMLIFrameElement>)] : frame ? [frame as HTMLIFrameElement] : []
  if (!frames.some((candidate) => event.source === candidate.contentWindow)) return null
  const data = event.data as { type?: unknown; key?: unknown; height?: unknown }
  if (data?.type === MESSAGE.key && typeof data.key === 'string' && (RELAYED_KEYS as readonly string[]).includes(data.key))
    return { type: MESSAGE.key, key: data.key }
  if (data?.type === MESSAGE.height && typeof data.height === 'number' && Number.isFinite(data.height)) return { type: MESSAGE.height, height: data.height }
  if (data?.type === MESSAGE.ready) return { type: MESSAGE.ready }
  return null
}
