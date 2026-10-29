// The document a frame shows: the author's HTML behind a policy and a small
// bridge of our own. The frame is always sandboxed without same-origin, so it
// cannot reach its host. When the author's scripts are refused, a CSP that
// admits only our nonce keeps them from running while the bridge still can:
// a key pressed inside a slide still pages the deck, a fluid page still
// reports its height, and print still learns when the slide is painted.
//
// Pure string building, so the browser and a server produce the same bytes.

import type { Scripts } from '@segnavia/format'
import { animationReport } from './animation-timing.ts'

export const MESSAGE = {
  key: 'segnavia:key',
  height: 'segnavia:height',
  ready: 'segnavia:ready',
  animation: 'segnavia:animation',
  slotFit: 'segnavia:slot-fit',
  freeze: 'segnavia:freeze',
  release: 'segnavia:release',
  inspect: 'segnavia:inspect',
  selectionRequest: 'segnavia:selection-request',
  selection: 'segnavia:selection',
} as const

export const SELECTION_TEXT_LIMIT = 1_000_000

export const PRINT_READY_ATTRIBUTE = 'data-segnavia-print-ready'

// A frame may legitimately reuse a small set of artwork many times. Sixty-four
// distinct backgrounds covers that case while bounding hostile or accidental
// pages before they can turn print readiness into an unbounded fetch queue.
export const PRINT_BACKGROUND_RESOURCE_LIMIT = 64

export interface AnimationReport {
  animated: boolean
  lengthMs: number | null
}

export interface AnimationMessage extends AnimationReport {
  type: typeof MESSAGE.animation
}

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
  // Holds the existing ready message until a document composer marks its root.
  readyAfterAttribute?: string
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
// Slot overflow is measured only from a box with a real size, after the print
// layout wait, and readiness waits for that report. An element without a
// layout box retries instead of reporting fit.
function bridgeScript(options: FrameOptions): string {
  const keys = options.relayKeys === false ? '[]' : JSON.stringify(RELAYED_KEYS)
  const selection =
    options.scripts === 'refuse'
      ? `window.addEventListener('message',function(e){var data=e.data;if(e.source===parent&&data&&data.type==='${MESSAGE.selectionRequest}'&&typeof data.id==='number'&&isFinite(data.id)){post({type:'${MESSAGE.selection}',id:data.id,text:String(getSelection?getSelection():''),pageText:(document.body||document.documentElement).innerText});}});`
      : ''
  const print =
    options.printAtMs === undefined
      ? ''
      : `var printAt=${JSON.stringify(options.printAtMs)};
var freeze=function(){if(!document.getAnimations)return;document.documentElement.getBoundingClientRect();var animations=document.getAnimations();for(var j=0;j<animations.length;j++){try{animations[j].pause();animations[j].currentTime=printAt;}catch(error){}}};
document.addEventListener('animationstart',freeze,true);document.addEventListener('transitionrun',freeze,true);
var printWaits=[];
var waitUntil=function(promise){printWaits.push(Promise.resolve(promise).catch(function(){}));};
var dispatchPrint=function(){var detail={atMs:printAt,waitUntil:waitUntil};var event;if(typeof CustomEvent==='function'){event=new CustomEvent('segnavia:print',{detail:detail});}else{event=document.createEvent('CustomEvent');event.initCustomEvent('segnavia:print',false,false,detail);}window.dispatchEvent(event);};
var finishPrint=function(){freeze();slotFit(function(){document.documentElement.setAttribute('${PRINT_READY_ATTRIBUTE}','');post({type:'${MESSAGE.ready}'});});};
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
var backgroundImages=function(){var elements=[document.documentElement,document.body].concat(Array.prototype.slice.call(document.querySelectorAll('*')));var resources={};var resourceCount=0;
var split=function(value){var parts=[];var start=0;var depth=0;for(var i=0;i<value.length;i++){var character=value.charAt(i);if(character==='(')depth++;else if(character===')')depth--;else if(character===','&&depth===0){parts.push(value.slice(start,i).trim());start=i+1;}}parts.push(value.slice(start).trim());return parts;};
var at=function(parts,index,fallback){return parts[index%parts.length]||fallback;};
var load=function(url){if(resources[url])return resources[url];if(resourceCount>=${PRINT_BACKGROUND_RESOURCE_LIMIT})return Promise.resolve(null);resourceCount++;var image=new Image();var ready=new Promise(function(resolve){image.onload=function(){resolve(image);};image.onerror=function(){resolve(null);};image.src=url;if(image.complete&&image.naturalWidth)resolve(image);});resources[url]=image.decode?image.decode().then(function(){return image;},function(){return null;}):ready;return resources[url];};
var length=function(value,total){if(value.slice(-1)==='%')return total*parseFloat(value)/100;var parsed=parseFloat(value);return isFinite(parsed)?parsed:0;};
var offset=function(value,free,axis){if(value==='center')return free/2;if(value===(axis==='x'?'right':'bottom'))return free;if(value===(axis==='x'?'left':'top'))return 0;if(value.slice(-1)==='%')return free*parseFloat(value)/100;return length(value,free);};
var geometry=function(size,position,repeat,image,width,height){var sizes=size.trim().split(/\\s+/);var naturalWidth=image.naturalWidth;var naturalHeight=image.naturalHeight;var drawWidth=naturalWidth;var drawHeight=naturalHeight;if(size==='cover'||size==='contain'){var scale=size==='cover'?Math.max(width/naturalWidth,height/naturalHeight):Math.min(width/naturalWidth,height/naturalHeight);drawWidth=naturalWidth*scale;drawHeight=naturalHeight*scale;}else{var first=sizes[0]||'auto';var second=sizes[1]||'auto';if(first!=='auto')drawWidth=length(first,width);if(second!=='auto')drawHeight=length(second,height);if(first==='auto'&&second!=='auto')drawWidth=naturalWidth*drawHeight/naturalHeight;if(second==='auto'&&first!=='auto')drawHeight=naturalHeight*drawWidth/naturalWidth;}var repeats=repeat.trim().split(/\\s+/);var repeatX=repeats[0]||'repeat';var repeatY=repeats[1]||repeatX;if(repeatX==='repeat-x'){repeatX='repeat';repeatY='no-repeat';}if(repeatX==='repeat-y'){repeatX='no-repeat';repeatY='repeat';}if(repeatX==='round'){drawWidth=width/Math.max(1,Math.round(width/drawWidth));}if(repeatY==='round'){drawHeight=height/Math.max(1,Math.round(height/drawHeight));}var positions=position.trim().split(/\\s+/);var x=offset(positions[0]||'0%',width-drawWidth,'x');var y=offset(positions[1]||'50%',height-drawHeight,'y');return {width:drawWidth,height:drawHeight,x:x,y:y,repeatX:repeatX,repeatY:repeatY};};
var coordinates=function(start,size,total,repeat){if(repeat==='no-repeat')return [start];if(repeat==='space'){var count=Math.floor(total/size);if(count<2)return [start];var spaced=[];var gap=(total-count*size)/(count-1);for(var i=0;i<count;i++)spaced.push(i*(size+gap));return spaced;}var values=[];start=((start%size)+size)%size-size;for(var value=start;value<total;value+=size)values.push(value);return values;};
var hostFor=function(element,pseudo,style){if(!pseudo)return element;var host=document.createElement('span');host.setAttribute('data-segnavia-print-background-pseudo',pseudo);host.style.position=style.position==='static'?'absolute':style.position;var names=['left','right','top','bottom','width','height','boxSizing','borderRadius','transform','transformOrigin','opacity'];for(var i=0;i<names.length;i++)host.style[names[i]]=style[names[i]];if(getComputedStyle(element).position==='static')element.style.position='relative';element.insertBefore(host,element.firstChild);return host;};
var lift=function(element,pseudo,host,style,layers,loaded){var rect=host.getBoundingClientRect();if(!pseudo){element.style.backgroundImage='none';if(getComputedStyle(element).position==='static')element.style.position='relative';if(style.zIndex==='auto')element.style.zIndex='0';element.style.isolation='isolate';}var wrapper=document.createElement('span');wrapper.setAttribute('data-segnavia-print-background-image','');wrapper.style.position='absolute';wrapper.style.inset='0';wrapper.style.overflow='hidden';wrapper.style.pointerEvents='none';wrapper.style.zIndex='-1';host.insertBefore(wrapper,host.firstChild);var sizes=split(style.backgroundSize);var positions=split(style.backgroundPosition);var repeats=split(style.backgroundRepeat);for(var index=layers.length-1;index>=0;index--){var layer=layers[index];var image=loaded[index];if(image){var canvas=document.createElement('canvas');canvas.width=Math.ceil(rect.width);canvas.height=Math.ceil(rect.height);canvas.style.position='absolute';canvas.style.inset='0';canvas.style.width='100%';canvas.style.height='100%';var context=canvas.getContext('2d');var box=geometry(at(sizes,index,'auto'),at(positions,index,'0% 0%'),at(repeats,index,'repeat'),image,rect.width,rect.height);var xs=coordinates(box.x,box.width,rect.width,box.repeatX);var ys=coordinates(box.y,box.height,rect.height,box.repeatY);for(var x=0;x<xs.length;x++)for(var y=0;y<ys.length;y++)context.drawImage(image,xs[x],ys[y],box.width,box.height);wrapper.append(canvas);}else if(!pseudo&&layer.indexOf('gradient(')!==-1){var gradient=document.createElement('span');gradient.style.position='absolute';gradient.style.inset='0';gradient.style.backgroundImage=layer;gradient.style.backgroundSize=at(sizes,index,'auto');gradient.style.backgroundPosition=at(positions,index,'0% 0%');gradient.style.backgroundRepeat=at(repeats,index,'repeat');wrapper.append(gradient);}}};
var settle=function(element,pseudo){var elementStyle=getComputedStyle(element);var rect=element.getBoundingClientRect();if(elementStyle.display==='none'||elementStyle.visibility==='hidden'||!rect.width||!rect.height)return null;var style=getComputedStyle(element,pseudo);if(style.display==='none'||style.visibility==='hidden')return null;var layers=split(style.backgroundImage);var pattern=/^url\\((?:"([^"]*)"|'([^']*)'|([^)]*))\\)$/;var urls=layers.map(function(layer){var match=pattern.exec(layer);return match?(match[1]||match[2]||match[3]||'').trim():null;});if(!urls.some(function(url){return !!url;}))return null;var host=hostFor(element,pseudo,style);var backgroundRect=host.getBoundingClientRect();if(!backgroundRect.width||!backgroundRect.height){if(pseudo)host.remove();return null;}return Promise.all(urls.map(function(url){return url?load(url):null;})).then(function(loaded){lift(element,pseudo,host,style,layers,loaded);});};
var waits=[];for(var i=0;i<elements.length;i++){if(!elements[i])continue;waits.push(settle(elements[i],null),settle(elements[i],'::before'),settle(elements[i],'::after'));}return waits;
};`
    : ''
  return `(function(){
var post=function(m){parent.postMessage(m,'*')};
var keys=${keys};
${selection}
${print}
${printBackground}
var liveAt=null;
var sawAnimations=false,canvasSeen=false,animationUnreadable=false,animationLength=0;
var calculateAnimationReport=${animationReport.toString()};
var animationReport=function(){
var animations=document.getAnimations?document.getAnimations():[],timings=[];canvasSeen=canvasSeen||Boolean(document.querySelector('canvas'));
for(var a=0;a<animations.length;a++){var timing=animations[a].effect&&animations[a].effect.getComputedTiming?animations[a].effect.getComputedTiming():null;timings.push(timing||{endTime:NaN,iterations:NaN});}
var current=calculateAnimationReport(timings,canvasSeen);if(animations.length){sawAnimations=true;if(current.lengthMs===null){animationUnreadable=true;}else{animationLength=Math.max(animationLength,current.lengthMs);}}
post({type:'${MESSAGE.animation}',animated:sawAnimations||canvasSeen,lengthMs:sawAnimations&&!animationUnreadable?animationLength:null});};
var dispatchAt=function(at){var detail={atMs:at,waitUntil:function(){}};var event;if(typeof CustomEvent==='function'){event=new CustomEvent('segnavia:print',{detail:detail});}else{event=document.createEvent('CustomEvent');event.initCustomEvent('segnavia:print',false,false,detail);}window.dispatchEvent(event);};
var freezeLive=function(){if(liveAt===null||!document.getAnimations)return;document.documentElement.getBoundingClientRect();var animations=document.getAnimations();for(var f=0;f<animations.length;f++){try{animations[f].pause();animations[f].currentTime=liveAt;}catch(error){}}};
window.addEventListener('message',function(e){var data=e.data;if(!data)return;if(data.type==='${MESSAGE.freeze}'&&typeof data.atMs==='number'&&isFinite(data.atMs)){liveAt=data.atMs;freezeLive();dispatchAt(liveAt);}else if(data.type==='${MESSAGE.release}'){liveAt=null;if(document.getAnimations){var animations=document.getAnimations();for(var r=0;r<animations.length;r++){try{animations[r].play();}catch(error){}}}}else if(data.type==='${MESSAGE.inspect}'){animationReport();}});
document.addEventListener('animationstart',function(){animationReport();freezeLive();},true);document.addEventListener('transitionrun',function(){animationReport();freezeLive();},true);
if(window.MutationObserver){new MutationObserver(function(){animationReport();freezeLive();}).observe(document.documentElement,{childList:true,subtree:true});}
var editable=function(t){return t&&(t.isContentEditable||t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT')};
var decodeFragment=function(value){return value.replace(/(?:%[0-9a-f]{2})+/gi,function(run){try{return decodeURIComponent(run);}catch(error){return run;}})};
var slotFitTries=0;
var slotFitElements=[],slotFitSlots={};
var slotFit=function(done){var marked=document.querySelectorAll('[data-slot-overflow]');if(!marked.length){if(done)done();return;}var slots=slotFitSlots;var rank={fit:0,shrunk:1,overflowed:2};var unlaid=false;
var fits=function(element){return element.scrollWidth<=element.clientWidth&&element.scrollHeight<=element.clientHeight;};
var record=function(key,state){if(slots[key]===undefined||rank[state]>rank[slots[key]])slots[key]=state;};
for(var s=0;s<marked.length;s++){var element=marked[s];if(slotFitElements.indexOf(element)!==-1)continue;if(element.getClientRects().length===0){unlaid=true;continue;}var parts=element.getAttribute('data-slot-overflow').split(':');var key;try{key=decodeURIComponent(parts[0]);}catch(error){continue;}var mode=parts[1];var state='fit';
if(mode==='truncate'){element.style.whiteSpace='nowrap';element.style.overflow='hidden';element.style.textOverflow='ellipsis';state=fits(element)?'fit':'overflowed';}
else if(mode==='shrink'){var size=parseFloat(element.style.fontSize);if(!isFinite(size))size=parseFloat(window.getComputedStyle(element).fontSize);var minimum=parseFloat(parts[2]);if(!isFinite(size)||!isFinite(minimum)||minimum<1||minimum>size)continue;var measurements=1;if(fits(element)){state='fit';}else{element.style.fontSize=minimum+'px';measurements++;if(!fits(element)){state='overflowed';}else{var low=minimum,high=size,best=minimum;while(measurements<64&&high-low>.01){var middle=(low+high)/2;element.style.fontSize=middle+'px';measurements++;if(fits(element)){best=middle;low=middle;}else{high=middle;}}element.style.fontSize=best+'px';state='shrunk';}}}
else if(mode==='refuse'){state=fits(element)?'fit':'overflowed';}else{continue;}record(key,state);slotFitElements.push(element);}
if(unlaid&&slotFitTries<40){slotFitTries++;var retry=function(){slotFit(done);};if(!window.requestAnimationFrame){setTimeout(retry,50);return;}var finished=false;var finish=function(){if(finished)return;finished=true;retry();};var fallback=setTimeout(finish,50);window.requestAnimationFrame(function(){clearTimeout(fallback);finish();});return;}
post({type:'${MESSAGE.slotFit}',slots:slots});if(done)done();};
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
    : `var pending=false,lastHeight=null;function send(){pending=false;var height=Math.ceil(document.documentElement.getBoundingClientRect().height);if(height===lastHeight)return;lastHeight=height;post({type:'${MESSAGE.height}',height:height});}
function report(){if(pending)return;pending=true;setTimeout(send,0);}
if(window.ResizeObserver){new ResizeObserver(report).observe(document.documentElement);}
document.addEventListener('DOMContentLoaded',report);window.addEventListener('load',report);`
}
function ready(){animationReport();${options.printBackground ? 'printBackground();' : ''}var imgs=Array.prototype.slice.call(document.images).map(function(i){return i.decode?i.decode().catch(function(){}):null;});${options.printBackground ? 'imgs=imgs.concat(backgroundImages());' : ''}
${options.printAtMs === undefined ? '' : 'freeze();dispatchPrint();'}
var composed=${options.readyAfterAttribute ? `new Promise(function(resolve){var root=document.documentElement;var name=${JSON.stringify(options.readyAfterAttribute)};if(root.hasAttribute(name)){${options.reportHeight === false ? '' : 'report();'}resolve();return;}if(!window.MutationObserver)return;new MutationObserver(function(records,observer){if(root.hasAttribute(name)){observer.disconnect();${options.reportHeight === false ? '' : 'report();'}resolve();}}).observe(root,{attributes:true,attributeFilter:[name]});})` : 'null'};
Promise.all(imgs.concat([document.fonts?document.fonts.ready:null,composed]${options.printAtMs === undefined ? '' : ',printWaits'})).then(function(){${options.printAtMs === undefined ? `slotFit(function(){post({type:'${MESSAGE.ready}'});});` : 'settlePrint();'}});}
if(document.readyState==='complete'){ready();}else{window.addEventListener('load',ready);}
})();`
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

// A block with its own valid dir keeps that direction. Every other block reads
// in the direction of its first letter, so English on a right-to-left page
// keeps its full stop on the right. The exclusion stays inside :where() so its
// attributes add no specificity and author CSS can still override the rule.
export const BLOCK_DIRECTION_CSS =
  ':where(:is(p,li,dt,dd,h1,h2,h3,h4,h5,h6,blockquote,figcaption,caption,td,th,summary,label,pre,div,section,article,aside,address):not([dir="ltr" i],[dir="rtl" i],[dir="auto" i])){unicode-bidi:plaintext}'

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
): { type: string; key?: string; height?: number; animated?: boolean; lengthMs?: number | null; slots?: Record<string, SlotFitState> } | null {
  const frames = frame && Symbol.iterator in Object(frame) ? [...(frame as Iterable<HTMLIFrameElement>)] : frame ? [frame as HTMLIFrameElement] : []
  if (!frames.some((candidate) => event.source === candidate.contentWindow)) return null
  const data = event.data as { type?: unknown; key?: unknown; height?: unknown; animated?: unknown; lengthMs?: unknown; slots?: unknown }
  if (data?.type === MESSAGE.key && typeof data.key === 'string' && (RELAYED_KEYS as readonly string[]).includes(data.key))
    return { type: MESSAGE.key, key: data.key }
  if (data?.type === MESSAGE.height && typeof data.height === 'number' && Number.isFinite(data.height)) return { type: MESSAGE.height, height: data.height }
  if (data?.type === MESSAGE.ready) return { type: MESSAGE.ready }
  const fit = slotFitMessageData(data)
  if (fit) return fit
  if (
    data?.type === MESSAGE.animation &&
    typeof data.animated === 'boolean' &&
    (data.lengthMs === null || (typeof data.lengthMs === 'number' && Number.isFinite(data.lengthMs) && data.lengthMs >= 0))
  )
    return { type: MESSAGE.animation, animated: data.animated, lengthMs: data.lengthMs }
  return null
}

export interface PageSelection {
  text: string
  pageText: string
}

export type SelectionMessage = { selection: PageSelection } | { oversize: true }

export function selectionMessage(event: MessageEvent, frame: HTMLIFrameElement | null, id: number): SelectionMessage | null {
  if (event.source !== frame?.contentWindow) return null
  const data = event.data as { type?: unknown; id?: unknown; text?: unknown; pageText?: unknown }
  if (data?.type !== MESSAGE.selection || data.id !== id || typeof data.text !== 'string' || typeof data.pageText !== 'string') return null
  if (data.text.length > SELECTION_TEXT_LIMIT || data.pageText.length > SELECTION_TEXT_LIMIT) return { oversize: true }
  return { selection: { text: data.text, pageText: data.pageText } }
}

export type SlotFitState = 'fit' | 'shrunk' | 'overflowed'

/** Validates the narrow slot-fit payload before a host accepts page measurements. */
export function slotFitMessageData(data: unknown): { type: typeof MESSAGE.slotFit; slots: Record<string, SlotFitState> } | null {
  if (!data || typeof data !== 'object' || (data as { type?: unknown }).type !== MESSAGE.slotFit) return null
  const slots = (data as { slots?: unknown }).slots
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) return null
  const entries = Object.entries(slots)
  if (entries.length > 200) return null
  const valid = new Set<unknown>(['fit', 'shrunk', 'overflowed'])
  if (entries.some(([key, state]) => typeof key !== 'string' || !valid.has(state))) return null
  return { type: MESSAGE.slotFit, slots: Object.fromEntries(entries) as Record<string, SlotFitState> }
}

export function animationMessage(event: MessageEvent, frames: HTMLIFrameElement | Iterable<HTMLIFrameElement> | null): AnimationMessage | null {
  const message = messageFrom(event, frames)
  return message?.type === MESSAGE.animation && typeof message.animated === 'boolean'
    ? { type: MESSAGE.animation, animated: message.animated, lengthMs: message.lengthMs ?? null }
    : null
}
