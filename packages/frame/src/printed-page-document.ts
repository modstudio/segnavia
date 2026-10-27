import { type Page, type ParentPage, type ParentPageMargin, resolveDirection, sheetMm } from '@segnavia/format'
import { defaultPageNumbering } from '@segnavia/html'
import { frameDocument } from './bridge.ts'

export class PrintedPagesRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrintedPagesRefusedError'
  }
}

interface ResolvedParent {
  name: string
  margin: ParentPageMargin
  head: string
  foot: string
}

const ZERO_MARGIN: ParentPageMargin = { top: 0, bottom: 0, inner: 0, outer: 0 }

function resolveParents(parents: ParentPage[]): Map<string, ResolvedParent> {
  const source = new Map(parents.map((parent) => [parent.name, parent]))
  const resolved = new Map<string, ResolvedParent>()
  const resolve = (parent: ParentPage): ResolvedParent => {
    const held = resolved.get(parent.name)
    if (held) return held
    const base = parent.basedOn ? resolve(source.get(parent.basedOn) as ParentPage) : undefined
    const result = {
      name: parent.name,
      margin: parent.margin ?? base?.margin ?? ZERO_MARGIN,
      head: parent.head ?? base?.head ?? '',
      foot: parent.foot ?? base?.foot ?? '',
    }
    resolved.set(parent.name, result)
    return result
  }
  for (const parent of parents) resolve(parent)
  return resolved
}

function geometryRefusal(page: Page, parents: Map<string, ResolvedParent>, width: number, height: number): void {
  const printed = page.printedPages as NonNullable<Page['printedPages']>
  const names = [...new Set(Object.values(printed.rules).filter((name): name is string => name !== undefined))]
  const normalNames = names.filter((name) => name !== printed.rules.first)
  const normal = parents.get(printed.rules.every) as ResolvedParent
  const textWidth = width - normal.margin.inner - normal.margin.outer
  const textHeight = height - normal.margin.top - normal.margin.bottom
  for (const name of normalNames) {
    const parent = parents.get(name) as ResolvedParent
    const candidateWidth = width - parent.margin.inner - parent.margin.outer
    const candidateHeight = height - parent.margin.top - parent.margin.bottom
    if (Math.abs(candidateWidth - textWidth) > 0.001) {
      throw new PrintedPagesRefusedError(
        `Parent pages "${normal.name}" and "${name}" could not establish one text width; make their inner plus outer margins equal to clear this refusal.`,
      )
    }
    if (Math.abs(candidateHeight - textHeight) > 0.001) {
      throw new PrintedPagesRefusedError(
        `Parent pages "${normal.name}" and "${name}" could not establish one text height outside the first page; make their top plus bottom margins equal to clear this refusal.`,
      )
    }
  }
  const lastName = printed.rules.last
  if (lastName) {
    const last = parents.get(lastName) as ResolvedParent
    if (JSON.stringify(last.margin) !== JSON.stringify(normal.margin)) {
      throw new PrintedPagesRefusedError(
        `Last parent page "${last.name}" could not establish geometry independent of which page is last; give it the same margins as "${normal.name}" to clear this refusal.`,
      )
    }
  }
}

const composer = `(function(){
var config=JSON.parse(document.getElementById('segnavia-printed-page-config').textContent);var source=document.querySelector('[data-segnavia-flow]');
var mm=function(value){return value*96/25.4};var paperWidth=mm(config.paper.width),paperHeight=mm(config.paper.height);
var parentByName={};for(var p=0;p<config.parents.length;p++)parentByName[config.parents[p].name]=config.parents[p];
var normal=parentByName[config.rules.every],first=parentByName[config.rules.first||config.rules.every];
var textWidth=paperWidth-mm(normal.margin.inner+normal.margin.outer),textHeight=paperHeight-mm(normal.margin.top+normal.margin.bottom);
var firstHeight=paperHeight-mm(first.margin.top+first.margin.bottom);var measure=document.createElement('div');measure.setAttribute('data-segnavia-measure','');
measure.style.cssText='position:absolute;visibility:hidden;inset-block-start:0;inset-inline-start:0;inline-size:'+textWidth+'px;block-size:'+textHeight+'px;column-width:'+textWidth+'px;column-gap:0;column-fill:auto;direction:'+config.direction+';';
var spacer=Math.max(0,textHeight-firstHeight);if(spacer){var space=document.createElement('div');space.style.cssText='block-size:'+spacer+'px;break-after:avoid';measure.append(space);}while(source.firstChild)measure.append(source.firstChild);source.replaceWith(measure);
var all=measure.querySelectorAll('*');for(var b=0;b<all.length;b++){var style=getComputedStyle(all[b]);if(style.breakBefore==='page')all[b].style.breakBefore='column';if(style.breakAfter==='page')all[b].style.breakAfter='column';}
measure.getBoundingClientRect();var rects=[];var walker=document.createTreeWalker(measure,NodeFilter.SHOW_TEXT);var node;while(node=walker.nextNode()){if(!node.data.trim())continue;var range=document.createRange();range.selectNodeContents(node);var held=range.getClientRects();for(var r=0;r<held.length;r++)if(held[r].width&&held[r].height)rects.push(held[r]);}
var xs=[];for(var x=0;x<rects.length;x++){var value=Math.round(rects[x].left*10)/10;if(!xs.some(function(held){return Math.abs(held-value)<1;}))xs.push(value);}xs.sort(function(a,b){return config.direction==='rtl'?b-a:a-b;});
var count=Math.max(1,Math.ceil(measure.scrollWidth/textWidth));var box=measure.getBoundingClientRect();while(xs.length<count)xs.push(box.left+(config.direction==='rtl'?-xs.length:xs.length)*textWidth);
var roman=function(value){var pairs=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']],out='';for(var i=0;i<pairs.length;i++)while(value>=pairs[i][0]){out+=pairs[i][1];value-=pairs[i][0];}return out;};
var hebrew=function(value){var ones=['','א','ב','ג','ד','ה','ו','ז','ח','ט'],tens=['','י','כ','ל','מ','נ','ס','ע','פ','צ'];var thousands=Math.floor(value/1000),rest=value%1000,out='';if(thousands)out=ones[thousands]+'׳';while(rest>=400){out+='ת';rest-=400;}out+=['','ק','ר','ש'][Math.floor(rest/100)];rest%=100;if(rest===15)return out+'טו';if(rest===16)return out+'טז';return out+tens[Math.floor(rest/10)]+ones[rest%10];};
var number=function(value){if(config.numbering==='hebrew')return hebrew(value);var result=config.numbering.indexOf('roman')===0?roman(value):String(value);return config.numbering==='roman-lower'?result.toLowerCase():result;};
var choose=function(index){var recto=index%2===1,role=recto?'recto':'verso',name=(recto?config.rules.recto:config.rules.verso)||config.rules.every;if(index===count&&config.rules.last){role='last';name=config.rules.last;}if(index===1&&config.rules.first){role='first';name=config.rules.first;}return {parent:parentByName[name],side:recto===(config.direction==='ltr')?'right':'left',role:role};};
var fill=function(root,index){var data={number:number(index),total:number(count)};var bindings=root.querySelectorAll('[data-slot-value]');for(var i=0;i<bindings.length;i++){var path=bindings[i].getAttribute('data-slot-value');if(path==='printedPage.number'||path==='printedPage.total'){bindings[i].removeAttribute('data-slot-value');bindings[i].textContent=data[path.slice(12)];if(!bindings[i].hasAttribute('dir'))bindings[i].setAttribute('dir','auto');}}};
var firstColumn=function(element){var held=element.getClientRects();if(!held.length)return 0;var left=Math.round(held[0].left*10)/10;var best=0,distance=Infinity;for(var i=0;i<xs.length;i++){var next=Math.abs(xs[i]-left);if(next<distance){distance=next;best=i;}}return best;};
var pages=document.createElement('div');pages.setAttribute('data-segnavia-pages','');for(var index=1;index<=count;index++){var selected=choose(index),margin=selected.parent.margin;var paper=document.createElement('section');paper.setAttribute('data-segnavia-printed-page',String(index));paper.setAttribute('data-segnavia-role',selected.role);paper.style.cssText='position:relative;box-sizing:border-box;inline-size:'+paperWidth+'px;block-size:'+paperHeight+'px;overflow:hidden;break-after:page;direction:'+config.direction+';';
var inlineStart=selected.side==='right'?margin.inner:margin.outer;var view=document.createElement('div');view.style.cssText='position:absolute;overflow:hidden;inset-block-start:'+mm(margin.top)+'px;inset-inline-start:'+mm(inlineStart)+'px;inline-size:'+textWidth+'px;block-size:'+(index===1?firstHeight:textHeight)+'px;';var clone=measure.cloneNode(true);clone.removeAttribute('data-segnavia-measure');clone.style.visibility='visible';clone.style.position='absolute';clone.style.insetBlockStart=(index===1&&spacer?-spacer:0)+'px';clone.style.insetInlineStart=(box.left-xs[index-1])+'px';var ids=clone.querySelectorAll('[id]');var originals=measure.querySelectorAll('[id]');for(var q=0;q<ids.length;q++)if(firstColumn(originals[q])!==index-1)ids[q].removeAttribute('id');view.append(clone);paper.append(view);
var furniture=function(region,html){if(!html)return;var held=document.createElement('div');held.setAttribute('data-segnavia-'+region,'');held.style.cssText='position:absolute;overflow:hidden;inset-inline-start:'+mm(inlineStart)+'px;inline-size:'+textWidth+'px;'+(region==='head'?'inset-block-start:0;block-size:'+mm(margin.top)+'px':'inset-block-end:0;block-size:'+mm(margin.bottom)+'px');held.innerHTML=html;fill(held,index);paper.append(held);};furniture('head',selected.parent.head);furniture('foot',selected.parent.foot);pages.append(paper);}measure.remove();document.body.append(pages);document.documentElement.setAttribute('data-segnavia-composed','');
})();`

export const PRINTED_PAGE_COMPOSER_SCRIPT = composer

export function printedPageDocument(page: Page, options: { nonce: string; css?: string }): string {
  if (!page.printedPages || !page.print) throw new PrintedPagesRefusedError('A composed page needs printedPages and print.paper.')
  const paper = sheetMm(page.print)
  const parents = resolveParents(page.printedPages.parents)
  geometryRefusal(page, parents, paper.width, paper.height)
  const direction = resolveDirection(page.dir, page.lang, page.html)
  const config = {
    paper,
    direction,
    rules: page.printedPages.rules,
    numbering: page.printedPages.numbering ?? defaultPageNumbering(page.lang),
    parents: [...parents.values()],
  }
  const css = `@page{size:${paper.width}mm ${paper.height}mm;margin:0}:where(html,body){margin:0!important;padding:0!important}:where([data-segnavia-pages]){inline-size:${paper.width}mm}:where([data-segnavia-printed-page]:last-child){break-after:auto}${options.css ?? ''}`
  const body = `<div data-segnavia-flow>${page.html}</div><script type="application/json" id="segnavia-printed-page-config">${JSON.stringify(config).replace(/</g, '\\u003c')}</script><script nonce="${options.nonce}">${composer}</script>`
  return frameDocument(body, { scripts: 'refuse', nonce: options.nonce, dir: direction, lang: page.lang, css, relayKeys: false, reportHeight: false })
}
