import {
  defaultPageNumbering,
  formatNumber,
  type Page,
  PRINTED_PAGE_LIMIT,
  PRINTED_PAGE_NUMBER_PATH,
  PRINTED_PAGE_ROLES,
  PRINTED_PAGE_TOTAL_PATH,
  PX_PER_MM,
  type ResolvedParentPage,
  resolveDirection,
  resolveParentPages,
  sheetMm,
} from '@segnavia/format'
import { printedPageAt } from '@segnavia/html'
import { frameDocument } from './bridge.ts'

export const PRINTED_PAGE_COMPOSED_ATTRIBUTE = 'data-segnavia-composed'
export const PRINTED_PAGE_FAILURE_ATTRIBUTE = 'data-segnavia-compose-failure'

export class PrintedPagesRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrintedPagesRefusedError'
  }
}

interface Geometry {
  paperWidth: number
  paperHeight: number
  textWidth: number
  textHeight: number
  firstHeight: number
}

function geometry(page: Page, parents: ResolvedParentPage[], width: number, height: number): Geometry {
  const printed = page.printedPages as NonNullable<Page['printedPages']>
  const byName = new Map(parents.map((parent) => [parent.name, parent]))
  const normal = byName.get(printed.rules.every) as ResolvedParentPage
  const textWidth = width - normal.margin.inner - normal.margin.outer
  const textHeight = height - normal.margin.top - normal.margin.bottom
  if (textWidth <= 0) {
    throw new PrintedPagesRefusedError(
      `Parent page "${normal.name}" could not establish a positive text width; reduce its inner plus outer margins to clear this refusal.`,
    )
  }
  if (textHeight <= 0) {
    throw new PrintedPagesRefusedError(
      `Parent page "${normal.name}" could not establish a positive text height; reduce its top plus bottom margins to clear this refusal.`,
    )
  }
  const roles = Object.entries(printed.rules).filter((entry): entry is [string, string] => entry[1] !== undefined)
  const names = [...new Set(roles.map(([, name]) => name))]
  for (const name of names) {
    const parent = byName.get(name) as ResolvedParentPage
    const candidateWidth = width - parent.margin.inner - parent.margin.outer
    const candidateHeight = height - parent.margin.top - parent.margin.bottom
    if (candidateWidth <= 0) {
      throw new PrintedPagesRefusedError(
        `Parent page "${name}" could not establish a positive text width; reduce its inner plus outer margins to clear this refusal.`,
      )
    }
    if (candidateHeight <= 0) {
      throw new PrintedPagesRefusedError(
        `Parent page "${name}" could not establish a positive text height; reduce its top plus bottom margins to clear this refusal.`,
      )
    }
    if (Math.abs(candidateWidth - textWidth) > 0.001) {
      throw new PrintedPagesRefusedError(
        `Parent pages "${normal.name}" and "${name}" could not establish one text width; make their inner plus outer margins equal to clear this refusal.`,
      )
    }
    const solelyFirst = roles.every(([role, used]) => used !== name || role === 'first')
    if (!solelyFirst && Math.abs(candidateHeight - textHeight) > 0.001) {
      throw new PrintedPagesRefusedError(
        `Parent pages "${normal.name}" and "${name}" could not establish one text height outside the first page; make their top plus bottom margins equal to clear this refusal.`,
      )
    }
  }
  const first = byName.get(printed.rules.first ?? printed.rules.every) as ResolvedParentPage
  const firstHeight = height - first.margin.top - first.margin.bottom
  if (firstHeight <= 0) {
    throw new PrintedPagesRefusedError(
      `First parent page "${first.name}" could not establish a positive text height; reduce its top plus bottom margins to clear this refusal.`,
    )
  }
  if (firstHeight > textHeight + 0.001) {
    throw new PrintedPagesRefusedError(
      `First parent page "${first.name}" has a taller text height than "${normal.name}"; increase its top plus bottom margins to clear this refusal.`,
    )
  }
  const lastName = printed.rules.last
  if (lastName) {
    const last = byName.get(lastName) as ResolvedParentPage
    if (JSON.stringify(last.margin) !== JSON.stringify(normal.margin)) {
      throw new PrintedPagesRefusedError(
        `Last parent page "${last.name}" could not establish geometry independent of which page is last; give it the same margins as "${normal.name}" to clear this refusal.`,
      )
    }
  }
  return {
    paperWidth: width * PX_PER_MM,
    paperHeight: height * PX_PER_MM,
    textWidth: textWidth * PX_PER_MM,
    textHeight: textHeight * PX_PER_MM,
    firstHeight: firstHeight * PX_PER_MM,
  }
}

function pageParts(html: string): { head: string; body: string } {
  if (!/<html\b|<body\b/i.test(html)) return { head: '', body: html }
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] ?? ''
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? ''
  const safeHead = [...head.matchAll(/<(?:style\b[^>]*>[\s\S]*?<\/style\s*|link\b[^>]*|meta\b[^>]*)>/gi)].map((match) => match[0]).join('')
  return { head: safeHead, body }
}

function composerScript(configJson: string): string {
  return `(function(){
var fail=function(reason){document.documentElement.setAttribute('${PRINTED_PAGE_FAILURE_ATTRIBUTE}',String(reason));};
var config=${configJson};var source=document.querySelector('[data-segnavia-flow]');if(!source){fail('the composed flow element is missing');return;}
var printedPageAt=${printedPageAt.toString()};
var readyImages=function(root){var images=Array.from(root.querySelectorAll('img,image'));return Promise.all(images.map(function(image){if(image.tagName.toLowerCase()==='img'&&image.decode)return image.decode().catch(function(){});if(image.tagName.toLowerCase()==='img'&&image.complete)return Promise.resolve();return new Promise(function(resolve){image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});});}));};
var loaded=document.readyState==='complete'?Promise.resolve():new Promise(function(resolve){window.addEventListener('load',resolve,{once:true});});Promise.all([loaded,document.fonts?document.fonts.ready:Promise.resolve(),readyImages(source)]).then(function(){
try{var parentByName={};for(var p=0;p<config.parents.length;p++)parentByName[config.parents[p].name]=config.parents[p];
var measure=document.createElement('div');measure.setAttribute('data-segnavia-measure','');measure.style.cssText='position:absolute;visibility:hidden;inset-block-start:0;inset-inline-start:0;inline-size:'+config.geometry.textWidth+'px;block-size:'+config.geometry.textHeight+'px;column-width:'+config.geometry.textWidth+'px;column-gap:0;column-fill:auto;direction:'+config.direction+';';
var spacer=Math.max(0,config.geometry.textHeight-config.geometry.firstHeight);if(spacer){var space=document.createElement('div');space.style.cssText='block-size:'+spacer+'px;break-after:avoid';measure.append(space);}while(source.firstChild)measure.append(source.firstChild);source.replaceWith(measure);
var all=measure.querySelectorAll('*');for(var b=0;b<all.length;b++){var style=getComputedStyle(all[b]);if(style.breakBefore==='page')all[b].style.breakBefore='column';if(style.breakAfter==='page')all[b].style.breakAfter='column';}
console.log('SEGNA-167 probe immediate',JSON.stringify({only:config.only,measure:config.measure,scrollWidth:measure.scrollWidth,clientWidth:measure.clientWidth,inlineSize:measure.getBoundingClientRect().width,documentWidth:document.documentElement.clientWidth,viewportWidth:window.innerWidth,textWidth:config.geometry.textWidth}));return new Promise(function(resolve){var observer=new ResizeObserver(function(){var inlineSize=measure.getBoundingClientRect().width;var paperSize=document.documentElement.clientWidth;if(Math.abs(inlineSize-config.geometry.textWidth)<=.5&&Math.abs(paperSize-config.geometry.paperWidth)<=.5){observer.disconnect();resolve();}});observer.observe(document.documentElement);observer.observe(measure);}).then(function(){console.log('SEGNA-167 probe settled',JSON.stringify({only:config.only,measure:config.measure,scrollWidth:measure.scrollWidth,clientWidth:measure.clientWidth,inlineSize:measure.getBoundingClientRect().width,documentWidth:document.documentElement.clientWidth,viewportWidth:window.innerWidth,textWidth:config.geometry.textWidth}));var count=Math.max(1,Math.ceil((measure.scrollWidth-.01)/config.geometry.textWidth));var setHeight=function(papers){var height=(papers*config.geometry.paperHeight)+'px';document.documentElement.style.blockSize=height;document.body.style.blockSize=height;};if(count>config.limit){fail('the composed flow needs '+count+' papers, above the limit '+config.limit+'; shorten the content to clear this refusal');measure.remove();if(config.measure){setHeight(count);document.documentElement.setAttribute('${PRINTED_PAGE_COMPOSED_ATTRIBUTE}','');}return;}if(config.expectedCount!==null&&count!==config.expectedCount){throw new Error('the composed page count changed from '+config.expectedCount+' to '+count+' between measurement and paper composition; wait for the page layout to settle or shorten the content to clear this refusal');}
var firstColumn=function(element){var held=element.getClientRects();if(!held.length)return 0;var box=measure.getBoundingClientRect();var distance=config.direction==='rtl'?box.right-held[0].right:held[0].left-box.left;return Math.max(0,Math.round(distance/config.geometry.textWidth));};
var fill=function(root,index){var data={};data['${PRINTED_PAGE_NUMBER_PATH}']=config.numbers[index-1];data['${PRINTED_PAGE_TOTAL_PATH}']=config.numbers[count-1];var bindings=root.querySelectorAll('[data-slot-value]');for(var i=0;i<bindings.length;i++){var path=bindings[i].getAttribute('data-slot-value');if(Object.prototype.hasOwnProperty.call(data,path)){bindings[i].removeAttribute('data-slot-value');bindings[i].textContent=data[path];if(!bindings[i].hasAttribute('dir'))bindings[i].setAttribute('dir','auto');}}};
var pages=document.createElement('div');pages.setAttribute('data-segnavia-pages','');for(var index=1;index<=count;index++){if(config.only!==null&&config.only!==index)continue;var selected=printedPageAt(config.rules,index,count,config.direction);if(config.roles.indexOf(selected.role)<0)throw new Error('unknown printed-page role '+selected.role);var parent=parentByName[selected.parent],margin=parent.margin;var paper=document.createElement('section');paper.setAttribute('data-segnavia-printed-page',String(index));paper.setAttribute('data-segnavia-role',selected.role);paper.style.cssText='position:relative;box-sizing:border-box;inline-size:'+config.geometry.paperWidth+'px;block-size:'+config.geometry.paperHeight+'px;overflow:hidden;break-after:page;direction:'+config.direction+';';
var inlineStart=index%2===1?margin.inner:margin.outer;var view=document.createElement('div');view.setAttribute('data-segnavia-page-view','');view.style.cssText='position:absolute;overflow:hidden;inset-block-start:'+margin.top+'px;inset-inline-start:'+inlineStart+'px;inline-size:'+config.geometry.textWidth+'px;block-size:'+(index===1?config.geometry.firstHeight:config.geometry.textHeight)+'px;';var clone=measure.cloneNode(true);clone.removeAttribute('data-segnavia-measure');clone.setAttribute('data-segnavia-flow-clone','');clone.style.visibility='visible';clone.style.position='absolute';clone.style.insetBlockStart=(index===1&&spacer?-spacer:0)+'px';clone.style.insetInlineStart=(-((index-1)*config.geometry.textWidth))+'px';var ids=clone.querySelectorAll('[id]'),originals=measure.querySelectorAll('[id]');for(var q=0;q<ids.length;q++)if(firstColumn(originals[q])!==index-1)ids[q].removeAttribute('id');view.append(clone);paper.append(view);
var furniture=function(region,html){if(!html)return;var held=document.createElement('div');held.setAttribute('data-segnavia-'+region,'');held.setAttribute('data-segnavia-parent',parent.name);var regionSize=region==='head'?margin.top:margin.bottom;held.style.cssText='position:absolute;overflow:hidden;inset-inline-start:'+inlineStart+'px;inline-size:'+config.geometry.textWidth+'px;'+(region==='head'?'inset-block-start:0;block-size:'+regionSize+'px':'inset-block-end:0;block-size:'+regionSize+'px');held.innerHTML=html;fill(held,index);paper.append(held);};furniture('head',parent.head);furniture('foot',parent.foot);pages.append(paper);}measure.remove();document.body.append(pages);var regions=pages.querySelectorAll('[data-segnavia-head],[data-segnavia-foot]');for(var f=0;f<regions.length;f++){if(regions[f].scrollHeight>regions[f].clientHeight+.5){var kind=regions[f].hasAttribute('data-segnavia-head')?'head':'foot';regions[f].setAttribute('data-segnavia-furniture-overflow',regions[f].getAttribute('data-segnavia-parent')+':'+kind+':'+(regions[f].scrollHeight-regions[f].clientHeight));}}setHeight(config.only===null?count:1);return Promise.all([document.fonts?document.fonts.ready:Promise.resolve(),readyImages(pages)]).then(function(){document.documentElement.setAttribute('${PRINTED_PAGE_COMPOSED_ATTRIBUTE}','');});});
}catch(error){fail(error instanceof Error?error.message:String(error));}}).catch(function(error){fail(error instanceof Error?error.message:String(error));});
})();`
}

export function printedPageDocument(
  page: Page,
  options: { nonce: string; css?: string; only?: number; expectedCount?: number; measure?: boolean; printBackground?: boolean },
): string {
  if (!page.printedPages || !page.print) throw new PrintedPagesRefusedError('A composed page needs printedPages and print.paper.')
  const paper = sheetMm(page.print)
  const resolved = resolveParentPages(page.printedPages.parents)
  const measured = geometry(page, resolved, paper.width, paper.height)
  const direction = resolveDirection(page.dir, page.lang, page.html)
  const numbering = page.printedPages.numbering ?? defaultPageNumbering(page.lang)
  const parents = resolved.map((parent) => ({
    ...parent,
    margin: Object.fromEntries(Object.entries(parent.margin).map(([key, value]) => [key, value * PX_PER_MM])),
  }))
  const config = {
    direction,
    geometry: measured,
    limit: PRINTED_PAGE_LIMIT,
    only: options.only ?? null,
    expectedCount: options.expectedCount ?? null,
    measure: options.measure ?? false,
    numbering,
    numbers: Array.from({ length: PRINTED_PAGE_LIMIT }, (_, index) => formatNumber(index + 1, numbering)),
    parents,
    roles: PRINTED_PAGE_ROLES,
    rules: page.printedPages.rules,
  }
  const json = JSON.stringify(config).replace(/</g, '\\u003c')
  const css = `@page{size:${paper.width}mm ${paper.height}mm;margin:0}:where(html,body){margin:0!important;padding:0!important}:where(html:not([${PRINTED_PAGE_COMPOSED_ATTRIBUTE}]),html:not([${PRINTED_PAGE_COMPOSED_ATTRIBUTE}]) body){block-size:0!important;min-block-size:0!important}:where([data-segnavia-flow]){position:absolute}:where([data-segnavia-pages]){inline-size:${paper.width}mm}:where([data-segnavia-printed-page]:last-child){break-after:auto}${options.css ?? ''}`
  const parts = pageParts(page.html)
  const body = `${parts.head}<div data-segnavia-flow>${parts.body}</div><script nonce="${options.nonce}">${composerScript(json)}</script>`
  return frameDocument(body, {
    scripts: 'refuse',
    nonce: options.nonce,
    dir: direction,
    lang: page.lang,
    css,
    relayKeys: false,
    reportHeight: options.measure === true,
    readyAfterAttribute: PRINTED_PAGE_COMPOSED_ATTRIBUTE,
    printBackground: options.printBackground,
  })
}

export const PRINTED_PAGE_COMPOSER_SCRIPT = composerScript('{}')
