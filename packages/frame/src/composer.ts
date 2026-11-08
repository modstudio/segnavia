import {
  type FlowingParentNames,
  type Folio,
  flowingParentNames,
  PRINTED_PAGE_NUMBER_PATH,
  PRINTED_PAGE_TOTAL_PATH,
  resolveDirection,
  type TextArea,
} from '@segnavia/format'
import {
  ABSOLUTE_PX,
  embedFunction,
  fitRegionSize,
  furnitureScript,
  heldPageNumber,
  lengthPx,
  openerPageIndex,
  PAGE_REFERENCE_SELECTOR,
  pageIndexForTarget,
  parseCssLength,
  windowPageIndex,
} from '@segnavia/html'
import { layoutScript } from '@segnavia/layout'
import { BOOK_LAYOUTS, bookPresentationScript, embeddedBookPresentationFunctions, pageScale, spreadSlots } from './book-presentation.ts'
import { dressPlanPages, fillFurniture, markFurnitureOverflow, markRegionOverflow } from './composer-dress.ts'
import { composerLayoutReady, forcedPageBreak, measureLineBoxes, measurementRefusal, sizeFlowGalley } from './composer-measure.ts'
import { DIAGRAM_READY_EXPR } from './diagram-document.ts'
import { advanceVisibleTime, decideLayoutSettle, LAYOUT_SETTLE_MS } from './layout-settle.ts'

export const COMPOSED_ATTRIBUTE = 'data-segnavia-composed'
export const COMPOSED_MS_ATTRIBUTE = 'data-segnavia-composed-ms'
export const COMPOSE_FAILURE_ATTRIBUTE = 'data-segnavia-compose-failure'
export const GALLEY_PRINT_CSS = '@media print{:where([data-segnavia-galley-source]){display:none!important}}'
// A valid book normally establishes its line boxes in one layout frame. One second admits
// throttled or deferred browser layout while still reporting a bounded measurement failure.
export const BOOK_MEASUREMENT_WAIT_MS = 1_000
export const WINDOW_EDGE_INSET_PX = 0.25

export interface FlowMeasurementFacts {
  id: string
  sourceBlocks: number
  contentBlocks: number
  measuredLines: number
}

export interface BookMeasurementFacts {
  hasLayout: boolean
  flows: readonly FlowMeasurementFacts[]
  plannedPages: number
  visibleElapsedMs: number
}

export type BookMeasurementDecision = 'retry' | 'compose' | 'refuse'

export interface VisibleMeasurementFacts {
  visibleElapsedMs: number
  frameElapsedMs: number
  hasLayout: boolean
  measured: boolean
}

export interface VisibleMeasurementDecision {
  decision: BookMeasurementDecision
  visibleElapsedMs: number
}

export function decideVisibleMeasurement(facts: VisibleMeasurementFacts, boundMs: number): VisibleMeasurementDecision {
  const visibleElapsedMs = advanceVisibleTime(facts)
  if (!facts.hasLayout) return { decision: 'retry', visibleElapsedMs }
  if (facts.measured) return { decision: 'compose', visibleElapsedMs }
  return { decision: visibleElapsedMs >= boundMs ? 'refuse' : 'retry', visibleElapsedMs }
}

export interface MeasuredKeepBlock {
  keepWithNext?: boolean
  keepWithPrevious?: boolean
}

export interface MeasuredKeepCandidate {
  avoid: boolean
  top: number
  bottom: number
}

export function measuredBlockConstraints(display: string, orphans: number, widows: number): { orphans?: number; widows?: number } {
  const blockContainers = ['block', 'flow-root', 'list-item', 'inline-block', 'table-cell', 'table-caption']
  if (!blockContainers.includes(display)) return {}
  return {
    ...(Number.isFinite(orphans) && orphans > 0 ? { orphans } : {}),
    ...(Number.isFinite(widows) && widows > 0 ? { widows } : {}),
  }
}

export function measuredKeepRuns(lines: readonly NoteLineBox[], candidates: readonly MeasuredKeepCandidate[]): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = []
  for (const candidate of candidates) {
    if (!candidate.avoid) continue
    const indexes = lines.flatMap((line, index) => {
      const middle = (line.top + line.bottom) / 2
      return middle >= candidate.top - 0.5 && middle <= candidate.bottom + 0.5 ? [index] : []
    })
    const start = indexes[0]
    const last = indexes.at(-1)
    if (start === undefined || last === undefined) continue
    const run = { start, end: last + 1 }
    if (!runs.some((held) => held.start === run.start && held.end === run.end)) runs.push(run)
  }
  return runs
}

export interface NoteLineBox {
  top: number
  bottom: number
}

export interface NoteFragmentExtent {
  start: number
  end: number
}

export interface NoteStackPiece {
  gap: number
  height: number
}

export function noteFragmentExtent(lines: readonly NoteLineBox[], startLine: number, endLine: number): NoteFragmentExtent | undefined {
  const first = lines[startLine]
  const last = lines[endLine - 1]
  if (!first || !last) return undefined
  const previous = lines[startLine - 1]
  const next = lines[endLine]
  const start = startLine === 0 ? first.top : (first.top + (previous?.bottom ?? first.top)) / 2
  const end = endLine >= lines.length ? last.bottom : (last.bottom + (next?.top ?? last.bottom)) / 2
  return { start, end }
}

export function noteSettlementOverlapsBody(plannedStackTop: number, settledStackTop: number, bodyEnd: number): boolean {
  return settledStackTop < plannedStackTop - 0.5 && settledStackTop < bodyEnd - 0.5
}

export function noteStackTops(blockSize: number, pieces: readonly NoteStackPiece[]): number[] {
  let top = blockSize - pieces.reduce((total, piece) => total + piece.gap + piece.height, 0)
  return pieces.map((piece) => {
    top += piece.gap
    const pieceTop = top
    top += piece.height
    return pieceTop
  })
}

export function appendMeasuredBlock<T extends MeasuredKeepBlock>(blocks: T[], block: T): void {
  const previous = blocks.at(-1)
  if (block.keepWithPrevious && previous) previous.keepWithNext = true
  delete block.keepWithPrevious
  blocks.push(block)
}

export function unmeasuredFlows(flows: readonly FlowMeasurementFacts[]): string[] {
  return flows.filter((flow) => flow.contentBlocks > 0 && flow.measuredLines === 0).map((flow) => flow.id)
}

export function decideBookMeasurement(facts: BookMeasurementFacts, boundMs: number): BookMeasurementDecision {
  if (!facts.hasLayout) return 'retry'
  const hasContent = facts.flows.some((flow) => flow.contentBlocks > 0)
  if (!hasContent) return 'compose'
  const deferred = unmeasuredFlows(facts.flows).length > 0 || facts.plannedPages === 0
  if (!deferred) return 'compose'
  return facts.visibleElapsedMs >= boundMs ? 'refuse' : 'retry'
}

export function pixelPhaseOffset(source: number, placed: number): number {
  return source - Math.floor(source) - (placed - Math.floor(placed))
}

export type PageReferenceFolio = { folio: string } | { refusal: string }

export function pageReferenceFolio(id: string, page: number, folios: readonly (Folio | null | string)[]): PageReferenceFolio {
  const folio = folios[page - 1]
  if (folio !== undefined) return { folio: typeof folio === 'string' ? folio : (folio?.text ?? '') }
  return {
    refusal: `page reference target ${id} lands on page ${page}, beyond the ${folios.length} computed folios; shorten the book to ${folios.length} pages or fewer to clear this refusal`,
  }
}

export function flowTextArea(parents: Partial<FlowingParentNames>, areas: Record<string, TextArea>): TextArea {
  const names = flowingParentNames(parents)
  const opener = areas[names.opener]
  const recto = areas[names.recto]
  const verso = areas[names.verso]
  if (!opener || !recto || !verso) throw new Error('A flow parent has no text area.')
  return { width: opener.width, height: Math.min(opener.height, recto.height, verso.height) }
}

export function embeddedComposerFunctions(): string {
  return `${embedFunction('flowingParentNames', flowingParentNames)}
${embedFunction('flowTextArea', flowTextArea)}
${embedFunction('spreadSlots', spreadSlots)}
${embedFunction('pageScale', pageScale)}
${embedFunction('pixelPhaseOffset', pixelPhaseOffset)}
${embedFunction('unmeasuredFlows', unmeasuredFlows)}
${embedFunction('decideBookMeasurement', decideBookMeasurement)}
${embedFunction('advanceVisibleTime', advanceVisibleTime)}
${embedFunction('decideVisibleMeasurement', decideVisibleMeasurement)}
${embedFunction('appendMeasuredBlock', appendMeasuredBlock)}
${embedFunction('measuredBlockConstraints', measuredBlockConstraints)}
${embedFunction('measuredKeepRuns', measuredKeepRuns)}
${embedFunction('noteFragmentExtent', noteFragmentExtent)}
${embedFunction('noteSettlementOverlapsBody', noteSettlementOverlapsBody)}
${embedFunction('noteStackTops', noteStackTops)}
${embedFunction('forcedPageBreak', forcedPageBreak)}
${embedFunction('composerLayoutReady', composerLayoutReady)}
${embedFunction('sizeFlowGalley', sizeFlowGalley)}
${embedFunction('measureLineBoxes', measureLineBoxes)}
${embedFunction('measurementRefusal', measurementRefusal)}
${embedFunction('fillFurniture', fillFurniture)}
${embedFunction('markFurnitureOverflow', markFurnitureOverflow)}
${embedFunction('markRegionOverflow', markRegionOverflow)}
${embedFunction('dressPlanPages', dressPlanPages)}
${embedFunction('decideLayoutSettle', decideLayoutSettle)}
${embeddedBookPresentationFunctions()}`
}

export function composerScript(configJson: string): string {
  const presentation = (JSON.parse(configJson) as { presentation?: unknown }).presentation !== undefined
  const script = `(function(){
var composeStarted=performance.now();
var fail=function(reason){var text=String(reason);document.documentElement.setAttribute('${COMPOSE_FAILURE_ATTRIBUTE}',text||'book composition failed without a reported reason');};
var config=${configJson};
var BOOK_LAYOUTS=${JSON.stringify(BOOK_LAYOUTS)};
${layoutScript()}
${furnitureScript()}
${embeddedComposerFunctions()}
${embedFunction('heldPageNumber', heldPageNumber)}
${embedFunction('windowPageIndex', windowPageIndex)}
${embedFunction('openerPageIndex', openerPageIndex)}
${embedFunction('pageIndexForTarget', pageIndexForTarget)}
${embedFunction('parseCssLength', parseCssLength)}
${embedFunction('lengthPx', lengthPx)}
${embedFunction('fitRegionSize', fitRegionSize)}
${embedFunction('resolveDirection', resolveDirection)}
${embedFunction('pageReferenceFolio', pageReferenceFolio)}
var ABSOLUTE_PX=${JSON.stringify(ABSOLUTE_PX)};
var elementWithAttr=function(root,attr,value){var nodes=root.querySelectorAll('['+attr+']');for(var i=0;i<nodes.length;i++){if(nodes[i].getAttribute(attr)===value)return nodes[i];}return null;};
var readyImages=function(root){var images=Array.from(root.querySelectorAll('img,image'));return Promise.all(images.map(function(image){if(image.tagName.toLowerCase()==='img'&&image.decode)return image.decode().catch(function(){});if(image.tagName.toLowerCase()==='img'&&image.complete)return Promise.resolve();return new Promise(function(resolve){image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});});}));};
var parentByName={};for(var parentIndex=0;parentIndex<config.parents.length;parentIndex++)parentByName[config.parents[parentIndex].name]=config.parents[parentIndex];
var areaByParentName={};for(var areaIndex=0;areaIndex<config.parents.length;areaIndex++)areaByParentName[config.parents[areaIndex].name]=config.parents[areaIndex].textArea;
document.documentElement.setAttribute('data-segnavia-parent-margins',JSON.stringify(config.parents.map(function(parent){return {name:parent.name,margin:parent.margin};})));
var columnWidth=function(columns,textWidth){if(columns<=1)return textWidth;return (textWidth-(columns-1)*config.geometry.columnGap)/columns;};
var sizeGalleys=function(){var flows=document.querySelectorAll('[data-segnavia-flow]');for(var f=0;f<flows.length;f++){if(flows[f].getAttribute('data-segnavia-kind')==='fixed'||flows[f].getAttribute('data-segnavia-kind')==='templated')continue;var area=flowTextArea(parentsOf(flows[f])||{},areaByParentName);sizeFlowGalley(flows[f],area.width,area.height,config.orphans,config.widows);var blocks=flows[f].children;for(var b=0;b<blocks.length;b++){var columnsAttr=blocks[b].getAttribute('data-columns');if(columnsAttr){var style=getComputedStyle(blocks[b]);var margins=(parseFloat(style.marginInlineStart)||0)+(parseFloat(style.marginInlineEnd)||0);blocks[b].style.boxSizing='border-box';blocks[b].style.inlineSize=(columnWidth(parseInt(columnsAttr,10),area.width)-margins)+'px';}var refs=blocks[b].querySelectorAll('a[href^="#"]');for(var r=0;r<refs.length;r++){var note=document.querySelector('[data-segnavia-note="'+refs[r].getAttribute('href').slice(1)+'"]');if(note){note.style.inlineSize=area.width+'px';note.style.setProperty('--segnavia-text-height',area.height+'px');}}}}};
var originTop=function(element){return element.getBoundingClientRect().top;};
var blockLines=measureLineBoxes;
var lineIndex=function(top,lines){var index=0;for(var i=0;i<lines.length;i++){if(top>=lines[i].top-0.5&&top<lines[i].bottom+0.5)return i;if(lines[i].top<=top)index=i;}return index;};
var blockKind=function(tag){if(/^h[1-6]$/.test(tag))return 'heading';if(tag==='table')return 'table';if(tag==='figure'||tag==='img')return 'figure';return 'text';};
var chapterOf=function(element){return Number(element.getAttribute('data-segnavia-chapter')||0);};
var flowKind=function(element){if(element.getAttribute('data-segnavia-kind')==='fixed')return 'fixed';if(element.getAttribute('data-segnavia-kind')==='templated')return 'templated';if(element.getAttribute('data-segnavia-kind')==='part')return 'part';if(element.classList.contains('segnavia-contents'))return 'contents';if(element.classList.contains('segnavia-front'))return 'front';if(element.classList.contains('segnavia-endnotes'))return 'endnotes';return 'chapter';};
var parentsOf=function(element){if(!element)return null;var roles=['opener','recto','verso','blank','fixed'];var parents=null;for(var i=0;i<roles.length;i++){var name=element.getAttribute('data-parent-'+roles[i]);if(!name)continue;if(!parents)parents={};parents[roles[i]]=name;}return parents;};
var withFlowMeta=function(flow,element){var opens=element.getAttribute('data-opens');if(opens)flow.opens=opens;var parents=parentsOf(element);if(parents)flow.parents=parents;var sequence=element.getAttribute('data-sequence');if(sequence)flow.sequence=sequence;var parts=element.getAttribute('data-segnavia-parts');if(parts)flow.parts=JSON.parse(parts);return flow;};
var measureMarks=function(block,lines,origin){var nodes=[];if(block.hasAttribute('data-mark'))nodes.push(block);var inner=block.querySelectorAll('[data-mark]');for(var i=0;i<inner.length;i++)nodes.push(inner[i]);var marks=[];for(var n=0;n<nodes.length;n++){var name=nodes[n].getAttribute('data-mark');if(!name)continue;var top=nodes[n].getBoundingClientRect().top-origin;marks.push({name:name,value:(nodes[n].textContent||'').replace(/\\s+/g,' ').trim(),line:lineIndex(top,lines)});}return marks;};
var measureRefs=function(block,lines,origin){var nodes=block.querySelectorAll('.segnavia-note-ref > a');var refs=[];for(var i=0;i<nodes.length;i++){if(nodes[i].parentElement&&nodes[i].parentElement.hasAttribute('data-segnavia-note-repeat'))continue;var href=nodes[i].getAttribute('href')||'';if(href.charAt(0)!=='#')continue;var note=elementWithAttr(document,'data-segnavia-note',href.slice(1));if(!note||!note.closest('[data-segnavia-notes-galley]'))continue;var top=nodes[i].getBoundingClientRect().top-origin;refs.push({note:href.slice(1),line:lineIndex(top,lines)});}return refs;};
var measureBlock=function(element,flowId,chapter,index,origin){var tag=element.tagName.toLowerCase();var lines=blockLines(element,origin);if(!lines.length)return null;var style=getComputedStyle(element);var keepWith=(style.getPropertyValue('--segnavia-keep-with')||'').trim();var columnsAttr=element.getAttribute('data-columns');var orphans=parseInt(style.orphans,10);var widows=parseInt(style.widows,10);var header=element.tHead?element.tHead.getBoundingClientRect().height:0;var block={kind:blockKind(tag),tag:tag,position:{chapter:chapter,block:index},lines:lines};var id=element.getAttribute('data-segnavia-id');if(id!==null)block.id=id;if(columnsAttr)block.columns=parseInt(columnsAttr,10);var constraints=measuredBlockConstraints(style.display,orphans,widows);if(constraints.orphans)block.orphans=constraints.orphans;if(constraints.widows)block.widows=constraints.widows;if(style.breakAfter==='avoid'||style.pageBreakAfter==='avoid'||keepWith==='next')block.keepWithNext=true;if(style.breakBefore==='avoid'||style.pageBreakBefore==='avoid'||keepWith==='previous')block.keepWithPrevious=true;if(forcedPageBreak(style.breakBefore))block.breakBefore=true;if(style.breakInside==='avoid'||style.pageBreakInside==='avoid')block.keepTogether=true;if(tag==='table'){var candidates=[];var groups=element.querySelectorAll('tr,thead,tfoot');for(var g=0;g<groups.length;g++){var groupStyle=getComputedStyle(groups[g]);var box=groups[g].getBoundingClientRect();candidates.push({avoid:groupStyle.breakInside==='avoid'||groupStyle.pageBreakInside==='avoid',top:box.top-origin,bottom:box.bottom-origin});}var runs=measuredKeepRuns(lines,candidates);if(runs.length)block.keepRuns=runs;}if(header>0)block.headerHeight=header;var refs=measureRefs(element,lines,origin);if(refs.length)block.footnoteRefs=refs;var marks=measureMarks(element,lines,origin);if(marks.length)block.marks=marks;return block;};
var contentBearing=function(element){if(getComputedStyle(element).display==='none')return false;if((element.textContent||'').trim()!=='')return true;var replaced='img,svg,video,canvas,picture,iframe,object,embed,math';if(element.matches(replaced)||element.querySelector(replaced))return true;var tag=element.tagName.toLowerCase();return (tag==='table'&&element.querySelector('tr')!==null)||element.querySelector('table tr')!==null;};
var measureFlow=function(element){var id=element.getAttribute('data-segnavia-flow')||element.id;var kind=flowKind(element);if(kind==='fixed'||kind==='templated'){var selector=kind==='templated'?'[data-segnavia-templated-page]':'[data-segnavia-designed-page]';var holders=element.querySelectorAll(selector);var fixed={id:id,kind:'fixed',pages:holders.length,sourceBlocks:0,contentBlocks:0};if(kind==='templated'){fixed.role='body';fixed.pageParents=[];for(var h=0;h<holders.length;h++){var templateName=holders[h].getAttribute('data-template');fixed.pageParents.push(mergeParents(parentsOf(element),parentsOf(templateName?elementWithAttr(document,'data-segnavia-template',templateName):null)));}}var headFixed=element.getAttribute('data-running-head');if(headFixed)fixed.runningHead=headFixed;return withFlowMeta(fixed,element);}var origin=originTop(element);var chapter=chapterOf(element);var blocks=[];var index=0;var contentBlocks=0;for(var i=0;i<element.children.length;i++){var child=element.children[i];if(child.tagName==='STYLE'||child.tagName==='SCRIPT')continue;index+=1;if(contentBearing(child))contentBlocks+=1;var block=measureBlock(child,id,chapter,index,origin);if(block)appendMeasuredBlock(blocks,block);}var flow={id:id,kind:kind,blocks:blocks,sourceBlocks:index,contentBlocks:contentBlocks};var head=element.getAttribute('data-running-head');if(head)flow.runningHead=head;return withFlowMeta(flow,element);};
var measureNotes=function(){var notes=[];var nodes=document.querySelectorAll('[data-segnavia-note]');for(var i=0;i<nodes.length;i++){var id=nodes[i].getAttribute('data-segnavia-note');var galley=nodes[i].closest('[data-segnavia-notes-galley]');var series=galley?galley.getAttribute('data-segnavia-note-series'):'';if(!id||!series)continue;notes.push({id:id,series:series,lines:blockLines(nodes[i],originTop(nodes[i]))});}return notes;};
var noteGap=function(root){var style=getComputedStyle(root);return (parseFloat(style.borderBlockStartWidth)||0)+(parseFloat(style.paddingBlockStart)||0)+(parseFloat(style.marginBlockStart)||0);};
var noteSeries=function(){var series=[];var nodes=document.querySelectorAll('[data-segnavia-notes-galley]');for(var i=0;i<nodes.length;i++){var name=nodes[i].getAttribute('data-segnavia-note-series');if(name)series.push({name:name,gap:noteGap(nodes[i])});}return series;};
var measureInput=function(){var flows=[];var nodes=document.querySelectorAll('[data-segnavia-flow]');for(var i=0;i<nodes.length;i++)flows.push(measureFlow(nodes[i]));var parents={};for(var p=0;p<config.parents.length;p++)parents[config.parents[p].name]=config.parents[p].textArea;return measurementsWithBreaks({flows:flows,notes:measureNotes(),geometry:{notesGap:config.geometry.notesGap,noteSeries:noteSeries()},parents:parents,parentNames:config.parentNames,settings:{orphans:config.orphans,widows:config.widows,rectoOpenings:config.rectoOpenings,direction:config.direction,endnotePlacement:config.endnotePlacement}},config.breaks||(config.plan&&config.plan.breaks)||[]);};
var planFolios={folios:[],total:'0'};
var folioOf=function(index){return planFolios.folios[index];};
var runningHeadOf=function(page,index){if(page.blank||(page.sectionOpening&&page.role!=='body'))return undefined;var recto=index%2===1;var choice=recto?config.runningHead.recto:config.runningHead.verso;if(!choice||choice==='title')return page.runningHead;if(choice.part)return page.parts?page.parts[choice.part]:undefined;var held=page.marks&&page.marks[choice.mark];if(!held)return page.runningHead;return choice.which==='last'?held.last:held.first;};
var pageForTarget=function(id,pages){var element=document.getElementById(id);var index;if(!element){index=pageIndexForTarget(pages,{flow:id});}else{var flow=element.closest('[data-segnavia-flow]');if(!flow)return '';var flowId=flow.getAttribute('data-segnavia-flow')||'';var holder=element.closest('[data-segnavia-designed-page],[data-segnavia-templated-page]');var heldPage=holder?Number(holder.getAttribute('data-segnavia-designed-page')||holder.getAttribute('data-segnavia-templated-page')):undefined;var target={flow:flowId};if(heldPage)target.heldPage=heldPage;else target.top=element.getBoundingClientRect().top-originTop(flow);index=pageIndexForTarget(pages,target);}if(index===undefined)return '';var result=pageReferenceFolio(id,index+1,planFolios.folios);if(result.refusal){fail(result.refusal);return '';}return result.folio;};
var pageReferences=function(){return document.querySelectorAll('${PAGE_REFERENCE_SELECTOR}');};
var pageReferenceId=function(node){var href=node.getAttribute('href')||'';return href.charAt(0)==='#'?href.slice(1):href.slice('segnavia:target/'.length);};
var fillPageReferences=function(pages){var nodes=pageReferences();for(var i=0;i<nodes.length;i++){var id=pageReferenceId(nodes[i]);var folio=pageForTarget(id,pages);nodes[i].textContent=folio;nodes[i].setAttribute('dir',resolveDirection(config.dir,config.lang,folio));}};
var unsettledPageReferences=function(pages){var nodes=pageReferences();var ids=[];for(var i=0;i<nodes.length;i++){var id=pageReferenceId(nodes[i]);if(nodes[i].textContent!==pageForTarget(id,pages)&&ids.indexOf(id)<0)ids.push(id);}return ids;};
var mergeParents=function(section,template){if(!section&&!template)return undefined;var roles=['opener','recto','verso','blank','fixed'];var parents={};var any=false;for(var i=0;i<roles.length;i++){var name=(section&&section[roles[i]])||(template&&template[roles[i]]);if(name){parents[roles[i]]=name;any=true;}}return any?parents:undefined;};
var stripIds=function(clone,original,win,origin){var consider=function(node,source){if(!node.getAttribute('id'))return;var sourceLines=blockLines(source,origin);var top=sourceLines.length?sourceLines[0].top:source.getBoundingClientRect().top-origin;if(!(top>=win.start&&top<win.end))node.removeAttribute('id');};consider(clone,original);var ids=clone.querySelectorAll('[id]');var sources=original.querySelectorAll('[id]');for(var i=0;i<ids.length;i++){var source=sources[i];if(!source){ids[i].removeAttribute('id');continue;}consider(ids[i],source);}};
var blockExtent=function(element,origin){var lines=blockLines(element,origin);if(!lines.length){var box=element.getBoundingClientRect();return {top:box.top-origin,bottom:box.bottom-origin};}return {top:lines[0].top,bottom:lines[lines.length-1].bottom};};
var flowInlineStart=function(flow,child){var flowBox=flow.getBoundingClientRect();var childBox=child.getBoundingClientRect();return config.direction==='rtl'?flowBox.right-childBox.right:childBox.left-flowBox.left;};
var placeHeader=function(area,page,textArea){if(!page.headerRepeat)return;for(var w=0;w<page.windows.length;w++){var win=page.windows[w];var flow=document.querySelector('[data-segnavia-flow="'+win.flow+'"]');if(!flow)continue;var origin=originTop(flow);var children=flow.children;for(var i=0;i<children.length;i++){var child=children[i];if(child.tagName!=='TABLE')continue;var extent=blockExtent(child,origin);if(!(extent.top<win.start&&extent.bottom>win.start))continue;var width=columnWidth(win.columns,textArea.width);var view=document.createElement('div');view.setAttribute('data-segnavia-table-header','');view.style.cssText='position:absolute;overflow:clip;inset-block-start:'+(win.top-page.headerRepeat)+'px;inset-inline-start:'+(win.column*(width+config.geometry.columnGap))+'px;inline-size:'+width+'px;block-size:'+page.headerRepeat+'px';var held=child.cloneNode(true);held.removeAttribute('id');var ids=held.querySelectorAll('[id]');for(var n=0;n<ids.length;n++)ids[n].removeAttribute('id');held.style.position='absolute';held.style.insetBlockStart='0';held.style.insetInlineStart=flowInlineStart(flow,child)+'px';held.style.inlineSize=child.getBoundingClientRect().width+'px';view.append(held);area.append(view);break;}}};
var placeWindow=function(area,win,keepFlowId,textArea){var flow=document.querySelector('[data-segnavia-flow="'+win.flow+'"]');if(!flow)return;var height=win.end-win.start;var width=columnWidth(win.columns,textArea.width);var view=document.createElement('div');view.setAttribute('data-segnavia-window','');view.setAttribute('data-flow',win.flow);view.setAttribute('data-start',String(win.start));view.setAttribute('data-end',String(win.end));view.setAttribute('data-top',String(win.top));view.setAttribute('data-column',String(win.column));view.setAttribute('data-columns',String(win.columns));view.style.cssText='position:absolute;overflow:clip;inset-block-start:'+win.top+'px;inset-inline-start:'+(win.column*(width+config.geometry.columnGap))+'px;inline-size:'+width+'px;block-size:'+height+'px';var clone=flow.cloneNode(false);if(!keepFlowId)clone.removeAttribute('id');clone.style.position='absolute';clone.style.visibility='visible';clone.style.insetBlockStart=(-win.start)+'px';clone.style.insetInlineStart='0';clone.style.inlineSize=textArea.width+'px';var origin=originTop(flow);var placed=0;var children=flow.children;for(var i=0;i<children.length;i++){var child=children[i];if(child.tagName==='STYLE'||child.tagName==='SCRIPT')continue;var extent=blockExtent(child,origin);if(!(extent.bottom>win.start&&extent.top<win.end))continue;if(placed===0){var firstTop=child.getBoundingClientRect().top-origin;if(firstTop>0){var spacer=document.createElement('div');spacer.setAttribute('data-segnavia-window-spacer','');spacer.style.cssText='display:block;block-size:0;padding-block-start:'+firstTop+'px;margin:0;border:0;overflow:hidden;';clone.append(spacer);}}var held=child.cloneNode(true);held.setAttribute('data-segnavia-block',String(i));if(placed===0)held.style.marginBlockStart='0';stripIds(held,child,win,origin);clone.append(held);placed+=1;}view.append(clone);area.append(view);};
var placeDesigned=function(paper,page,index,pages){if(page.role!=='fixed')return;var m=heldPageNumber(pages,index);var holder=document.querySelector('[data-segnavia-flow="'+page.flow+'"] [data-segnavia-designed-page="'+m+'"]');if(!holder)return;var clone=holder.cloneNode(true);clone.removeAttribute('hidden');clone.removeAttribute('data-segnavia-designed-page');clone.style.cssText='position:absolute;inset-block-start:0;inset-block-end:0;inset-inline-start:0;inset-inline-end:0;overflow:hidden;direction:'+config.direction;if(config.lang)clone.setAttribute('lang',config.lang);if(m===1){var section=document.querySelector('[data-segnavia-flow="'+page.flow+'"]');if(section&&section.id)clone.id=section.id;}paper.append(clone);};
var regionExcess=function(el){var box=el.getBoundingClientRect();var top=box.top,right=box.right,bottom=box.bottom,left=box.left;var range=document.createRange();range.selectNodeContents(el);if(!range.collapsed){var text=range.getBoundingClientRect();if(text.top<top)top=text.top;if(text.right>right)right=text.right;if(text.bottom>bottom)bottom=text.bottom;if(text.left<left)left=text.left;}var kids=el.querySelectorAll('*');for(var k=0;k<kids.length;k++){var held=kids[k].getBoundingClientRect();if(held.top<top)top=held.top;if(held.right>right)right=held.right;if(held.bottom>bottom)bottom=held.bottom;if(held.left<left)left=held.left;}return {block:Math.max(bottom-box.bottom,box.top-top),inline:Math.max(right-box.right,box.left-left)};};
var fitRegion=function(el,template){var minAttr=el.getAttribute('data-fit-min');if(!minAttr)return;var stepAttr=el.getAttribute('data-fit-step');if(!stepAttr)return;var min=lengthPx(minAttr,ABSOLUTE_PX);var step=lengthPx(stepAttr,ABSOLUTE_PX);if(min===undefined||step===undefined)return;var original=el.style.fontSize;var max=parseFloat(getComputedStyle(el).fontSize);var result=fitRegionSize(max,min,step,function(size){el.style.fontSize=size+'px';var excess=regionExcess(el);return excess.block>.5||excess.inline>.5;});if(result.usable===false){el.style.fontSize=original;if(min>max){var name=el.getAttribute('data-region')||'';el.setAttribute('data-segnavia-region-fit-min',template+':'+name+':'+minAttr);}return;}if(result.overflow||Math.abs(result.size-max)>1e-6)el.style.fontSize=result.size+'px';else el.style.fontSize=original;};
var placeTemplated=function(text,page,index,pages){var flow=document.querySelector('[data-segnavia-flow="'+page.flow+'"]');if(!flow||flow.getAttribute('data-segnavia-kind')!=='templated'||page.blank)return;var m=heldPageNumber(pages,index);var holder=flow.querySelector('[data-segnavia-templated-page="'+m+'"]');if(!holder)return;var name=holder.getAttribute('data-template')||'';var template=elementWithAttr(document,'data-segnavia-template',name);if(!template)return;var clone=template.cloneNode(true);clone.removeAttribute('hidden');clone.removeAttribute('data-segnavia-template');var roles=['opener','recto','verso','blank','fixed'];for(var r=0;r<roles.length;r++)clone.removeAttribute('data-parent-'+roles[r]);clone.style.cssText='position:absolute;inset-block-start:0;inset-block-end:0;inset-inline-start:0;inset-inline-end:0;overflow:visible;direction:'+config.direction;if(config.lang)clone.setAttribute('lang',config.lang);var fragments=holder.querySelectorAll('[data-region]');for(var i=0;i<fragments.length;i++){var region=fragments[i].getAttribute('data-region');if(!region)continue;var target=clone.querySelector('[data-region="'+region+'"]');if(!target)continue;target.innerHTML='';var kids=fragments[i].childNodes;for(var k=0;k<kids.length;k++)target.append(kids[k].cloneNode(true));}clone.setAttribute('data-template',name);if(m===1&&flow.id)clone.id=flow.id;text.append(clone);};
var holdNote=function(root,continued){var clone=root.cloneNode(true);if(continued){clone.removeAttribute('id');var ids=clone.querySelectorAll('[id]');for(var i=0;i<ids.length;i++)ids[i].removeAttribute('id');}clone.style.position='absolute';clone.style.insetInlineStart='0';return clone;};
var positionHeldNotePieces=function(pieces,tops){for(var i=0;i<pieces.length;i++){pieces[i].view.style.insetBlockStart=tops[i]+'px';pieces[i].view.style.blockSize=pieces[i].height+'px';pieces[i].clone.style.insetBlockStart=(-pieces[i].start)+'px';}};
var placeNotes=function(area,fragments,textArea,seriesGeometry){if(!fragments.length)return;var pieces=[];var previousSeries='';for(var i=0;i<fragments.length;i++){var root=document.querySelector('[data-segnavia-note="'+fragments[i].id+'"]');if(!root)continue;var lines=blockLines(root,originTop(root));var extent=noteFragmentExtent(lines,fragments[i].start,fragments[i].end);if(!extent)continue;var gap=0;if(fragments[i].series!==previousSeries){for(var s=0;s<seriesGeometry.length;s++)if(seriesGeometry[s].name===fragments[i].series){gap=seriesGeometry[s].gap;break;}}var height=extent.end-extent.start;var view=document.createElement('div');view.setAttribute('data-segnavia-page-note',fragments[i].id);view.setAttribute('data-segnavia-note-lines',String(fragments[i].end-fragments[i].start));view.setAttribute('data-segnavia-note-total-lines',String(lines.length));view.setAttribute('data-segnavia-note-start',String(fragments[i].start));view.setAttribute('data-segnavia-note-end',String(fragments[i].end));view.setAttribute('data-segnavia-note-gap',String(gap));view.setAttribute('data-segnavia-note-planned-height',String(height));view.style.cssText='position:absolute;overflow:clip;inset-inline-start:0;inline-size:100%';var clone=holdNote(root,fragments[i].start!==0);view.append(clone);area.append(view);pieces.push({view:view,clone:clone,start:extent.start,height:height,gap:gap});previousSeries=fragments[i].series;}if(!pieces.length)return;var tops=noteStackTops(textArea.height,pieces);area.setAttribute('data-segnavia-note-planned-top',String(tops[0]));positionHeldNotePieces(pieces,tops);};
var alignWindowPhases=function(){var views=document.querySelectorAll('[data-segnavia-pages] [data-segnavia-window]');for(var i=0;i<views.length;i++){var view=views[i];var flow=document.querySelector('[data-segnavia-galley-source] [data-segnavia-flow="'+view.getAttribute('data-flow')+'"]');if(!flow)continue;var source=flow.getBoundingClientRect().top+Number(view.getAttribute('data-start'));var placed=view.getBoundingClientRect().top;view.style.insetBlockStart=(parseFloat(view.style.insetBlockStart)+pixelPhaseOffset(source,placed))+'px';var clone=view.firstElementChild;if(clone)clone.style.insetBlockStart=(parseFloat(clone.style.insetBlockStart)+${WINDOW_EDGE_INSET_PX})+'px';}};
var alignHeldNotes=function(){var views=document.querySelectorAll('[data-segnavia-pages] [data-segnavia-page-note]');for(var i=0;i<views.length;i++){var view=views[i];var clone=view.firstElementChild;var id=view.getAttribute('data-segnavia-page-note');var source=document.querySelector('[data-segnavia-galley-source] [data-segnavia-note="'+id+'"]');if(!clone||!source){fail('a page note could not be matched to its galley source; keep data-segnavia-note on the galley note to clear this refusal');return false;}var sourceLines=blockLines(source,originTop(source));var cloneLines=blockLines(clone,originTop(clone));if(!sourceLines.length||sourceLines.length!==cloneLines.length){fail('a page note clone does not have the galley note line boxes; keep the clone contents and width so the lines match to clear this refusal');return false;}var delta=cloneLines[0].top-sourceLines[0].top;for(var n=1;n<sourceLines.length;n++){if(Math.abs((cloneLines[n].top-sourceLines[n].top)-delta)>0.5){fail('a page note lines do not share one offset from the galley; the clone must keep the galley line boxes except for a single collapsing-margin shift to clear this refusal');return false;}}clone.style.insetBlockStart=(parseFloat(clone.style.insetBlockStart)-delta)+'px';}return true;};
var settleHeldNoteViews=function(){var areas=document.querySelectorAll('[data-segnavia-pages] [data-segnavia-text]');for(var a=0;a<areas.length;a++){var views=areas[a].querySelectorAll(':scope > [data-segnavia-page-note]');var pieces=[];for(var i=0;i<views.length;i++){var view=views[i];var clone=view.firstElementChild;var id=view.getAttribute('data-segnavia-page-note')||'';if(!clone){fail('the placed page note '+id+' has no held clone; keep its held clone in the note view to clear this refusal');return false;}var lines=blockLines(clone,originTop(clone));var plannedCount=Number(view.getAttribute('data-segnavia-note-total-lines'));if(lines.length!==plannedCount){fail('the page note '+id+' planned '+plannedCount+' lines but its held clone has '+lines.length+' lines; the note lines changed after pagination, so keep its contents, width, and line metrics stable to clear this refusal');return false;}var extent=noteFragmentExtent(lines,Number(view.getAttribute('data-segnavia-note-start')),Number(view.getAttribute('data-segnavia-note-end')));if(!extent){fail('the page note '+id+' could not re-derive its planned fragment from '+plannedCount+' held line boxes; keep its planned line range in the held clone to clear this refusal');return false;}pieces.push({view:view,clone:clone,start:extent.start,height:extent.end-extent.start,gap:Number(view.getAttribute('data-segnavia-note-gap'))});}if(!pieces.length)continue;var tops=noteStackTops(parseFloat(areas[a].style.blockSize),pieces);var plannedStackTop=Number(areas[a].getAttribute('data-segnavia-note-planned-top'));var settledStackTop=tops[0];var windows=areas[a].querySelectorAll(':scope > [data-segnavia-window]');var bodyEnd=0;for(var w=0;w<windows.length;w++){var bottom=parseFloat(windows[w].style.insetBlockStart)+windows[w].getBoundingClientRect().height;if(bottom>bodyEnd)bodyEnd=bottom;}if(noteSettlementOverlapsBody(plannedStackTop,settledStackTop,bodyEnd)){fail('settled page note lines move the note stack into the planned body; shorten the page notes or body so their settled line boxes do not overlap');return false;}positionHeldNotePieces(pieces,tops);}return true;};
${
  presentation
    ? `var presentScreen=function(pages,count){if(!config.presentation)return;var spread=config.presentation.spread;var columns=spread?2:1;var slots=spread?spreadSlots(count):count;if(spread&&slots>0){var blank=document.createElement('div');blank.setAttribute('data-segnavia-spread-blank','');pages.insertBefore(blank,pages.firstChild);}pages.style.cssText='position:absolute;display:grid;grid-template-columns:repeat('+columns+','+config.geometry.paperWidth+'px);inline-size:'+(columns*config.geometry.paperWidth)+'px;block-size:'+Math.ceil(slots/columns)*config.geometry.paperHeight+'px;direction:'+config.direction+';transform-origin:top '+(config.direction==='rtl'?'right':'left')+';';document.documentElement.style.cssText+=';overflow:auto;block-size:100%';document.body.style.cssText='position:relative;overflow-x:hidden;min-block-size:0;';var scalePages=function(){var height=Math.ceil(slots/columns)*config.geometry.paperHeight;var scale=pageScale(document.documentElement.getBoundingClientRect().width,config.geometry.paperWidth,columns);pages.style.transform='scale('+scale+')';pages.style.left=config.direction==='rtl'?'auto':'0';pages.style.right=config.direction==='rtl'?'0':'auto';document.body.style.blockSize=height*scale+'px';};scalePages();${bookPresentationScript('pages', 'scalePages();', 'config.pageMarker')}if(typeof ResizeObserver==='function')new ResizeObserver(scalePages).observe(document.documentElement);else window.addEventListener('resize',scalePages);};
`
    : 'var presentScreen=function(){};'
}
var compose=function(plan,seriesGeometry){var total=planFolios.total;var pages=dressPlanPages(plan,config.only,function(pages,page,index){var folio=folioOf(index);var selected={parent:page.parent,side:page.side,folio:folio,runningHead:runningHeadOf(page,index+1)};var parent=parentByName[selected.parent];var margin=parent.margin;var textArea=parent.textArea;var paper=document.createElement('section');paper.setAttribute(config.pageMarker,String(index+1));for(var pageAttributeIndex=0;pageAttributeIndex<(config.pageAttributes||[]).length;pageAttributeIndex++)paper.setAttribute(config.pageAttributes[pageAttributeIndex],'');paper.setAttribute('data-segnavia-role',page.role);paper.setAttribute('data-segnavia-side',page.face);paper.setAttribute('data-segnavia-sequence',page.sequence);paper.setAttribute('data-segnavia-number',String(page.number));paper.setAttribute('data-segnavia-flow',page.flow);paper.setAttribute('data-segnavia-parent',parent.name);paper.setAttribute('data-segnavia-folio',folio||'');paper.style.cssText='position:relative;box-sizing:border-box;inline-size:'+config.geometry.paperWidth+'px;block-size:'+config.geometry.paperHeight+'px;overflow:hidden;break-after:page;direction:'+config.direction+';';var inlineStart=(selected.side==='right')===(config.direction==='ltr')?margin.inlineStart:margin.inlineEnd;var text=document.createElement('div');text.setAttribute('data-segnavia-text','');text.style.cssText='position:absolute;overflow:visible;inset-block-start:'+margin.blockStart+'px;inset-inline-start:'+inlineStart+'px;inline-size:'+textArea.width+'px;block-size:'+textArea.height+'px';var seenFlows={};for(var w=0;w<page.windows.length;w++){var keepFlowId=!seenFlows[page.windows[w].flow];seenFlows[page.windows[w].flow]=true;placeWindow(text,page.windows[w],keepFlowId&&page.sectionOpening,textArea);}placeHeader(text,page,textArea);placeNotes(text,page.notes,textArea,seriesGeometry);paper.append(text);placeDesigned(paper,page,index,plan.pages);placeTemplated(text,page,index,plan.pages);var furniture=function(region,html){if(!html)return;var held=document.createElement('div');held.setAttribute('data-segnavia-'+region,'');held.setAttribute('data-segnavia-parent',parent.name);var regionSize=region==='head'?margin.blockStart:margin.blockEnd;held.style.cssText='position:absolute;overflow:hidden;inset-inline-start:'+inlineStart+'px;inline-size:'+textArea.width+'px;'+(region==='head'?'inset-block-start:0;block-size:'+regionSize+'px':'inset-block-end:0;block-size:'+regionSize+'px');var values={};if(selected.folio!==undefined)values.folio=selected.folio;if(selected.runningHead!==undefined)values.runningHead=selected.runningHead;if(page.marks!==undefined)values.marks=page.marks;values.total=total;fillFurniture(held,html,values,config.dir,config.lang,'${PRINTED_PAGE_NUMBER_PATH}','${PRINTED_PAGE_TOTAL_PATH}',fillBookFurniture);paper.append(held);};furniture('head',parent.head);furniture('foot',parent.foot);pages.append(paper);});var galleys=document.querySelector('[data-segnavia-galleys]');if(galleys){galleys.setAttribute('data-segnavia-galley-source','');galleys.style.cssText='position:absolute;inset-inline-start:-10000px;visibility:visible;';var held=galleys.querySelectorAll('[id]');for(var i=0;i<held.length;i++)held[i].removeAttribute('id');}document.body.append(pages);var furnitureRegions=pages.querySelectorAll('[data-segnavia-head],[data-segnavia-foot]');for(var furnitureIndex=0;furnitureIndex<furnitureRegions.length;furnitureIndex++){var furniturePage=furnitureRegions[furnitureIndex].closest('['+config.pageMarker+']');if(furniturePage)markFurnitureOverflow(furnitureRegions[furnitureIndex],furniturePage);}alignWindowPhases();if(!alignHeldNotes()||!settleHeldNoteViews())return pages;var filled=pages.querySelectorAll('[data-template]');for(var t=0;t<filled.length;t++){var regions=filled[t].querySelectorAll('[data-region]');for(var r=0;r<regions.length;r++)fitRegion(regions[r],filled[t].getAttribute('data-template')||'');var paper=filled[t].closest('['+config.pageMarker+']');markRegionOverflow(filled[t],paper?paper.getAttribute('data-segnavia-folio')||'':'',regionExcess);}var height=((config.only===null||config.only===undefined?plan.pages.length:1)*config.geometry.paperHeight)+'px';document.documentElement.style.blockSize=height;document.body.style.blockSize=height;return pages;};
var measurementFlows=function(input){var facts=[];for(var i=0;i<input.flows.length;i++){var flow=input.flows[i];var lines=0;var blocks=flow.blocks||[];for(var b=0;b<blocks.length;b++)lines+=blocks[b].lines.length;facts.push({id:flow.id,sourceBlocks:flow.sourceBlocks,contentBlocks:flow.contentBlocks,measuredLines:lines});}return facts;};
var nextLayoutFrame=function(){return new Promise(function(resolve){var settled=false;var done=function(){if(settled)return;settled=true;resolve();};if(window.requestAnimationFrame)window.requestAnimationFrame(done);setTimeout(done,16);});};
var publishPlan=function(plan){var previous=document.querySelectorAll('script[data-segnavia-plan]');for(var i=0;i<previous.length;i++)previous[i].remove();var carrier=document.createElement('script');carrier.type='application/json';carrier.setAttribute('data-segnavia-plan','');carrier.textContent=JSON.stringify(plan).replace(/</g,'\\u003c');document.body.append(carrier);};
var loaded=document.readyState==='complete'?Promise.resolve():new Promise(function(resolve){window.addEventListener('load',resolve,{once:true});});
Promise.all([loaded,${DIAGRAM_READY_EXPR},document.fonts?document.fonts.ready:Promise.resolve(),readyImages(document)]).then(function(){
var visibleElapsed=0;
var visibleStartedAt=performance.now();
var settleVisibleElapsed=0;
var settleStartedAt;
var settlePrevious=[];
var measurementContinuation=function(input,plannedPages){var flowMeasurements=measurementFlows(input);var measurement=decideBookMeasurement({hasLayout:true,flows:flowMeasurements,plannedPages:plannedPages,visibleElapsedMs:visibleElapsed},Infinity);var measurementNow=performance.now();var measured=decideVisibleMeasurement({visibleElapsedMs:visibleElapsed,frameElapsedMs:measurementNow-visibleStartedAt,hasLayout:true,measured:measurement==='compose'},${BOOK_MEASUREMENT_WAIT_MS});visibleElapsed=measured.visibleElapsedMs;visibleStartedAt=measurementNow;if(measured.decision==='retry')return nextLayoutFrame().then(composeWhenMeasurable);if(measured.decision==='refuse'){fail(measurementRefusal(config.refusalSubject,unmeasuredFlows(flowMeasurements)));return true;}return false;};
var composeWhenMeasurable=function(){
try{
sizeGalleys();
var settleFlows=document.querySelectorAll('[data-segnavia-flow]:not([data-segnavia-kind="fixed"]):not([data-segnavia-kind="templated"])');var hasLayout=settleFlows.length===0||composerLayoutReady(settleFlows[0]);var visibleNow=performance.now();var visibility=decideVisibleMeasurement({visibleElapsedMs:visibleElapsed,frameElapsedMs:visibleNow-visibleStartedAt,hasLayout:hasLayout,measured:true},${BOOK_MEASUREMENT_WAIT_MS});visibleElapsed=visibility.visibleElapsedMs;visibleStartedAt=visibleNow;if(settleStartedAt===undefined){if(hasLayout)settleStartedAt=visibleNow;}else{settleVisibleElapsed=advanceVisibleTime({visibleElapsedMs:settleVisibleElapsed,frameElapsedMs:visibleNow-settleStartedAt,hasLayout:hasLayout});settleStartedAt=visibleNow;}if(!hasLayout)return nextLayoutFrame().then(composeWhenMeasurable);var settled=true;for(var settleIndex=0;settleIndex<settleFlows.length;settleIndex++){var settleFlow=settleFlows[settleIndex];var settleSample={inlineSize:settleFlow.getBoundingClientRect().width,scrollWidth:settleFlow.scrollWidth};var previousSettleSample=settlePrevious[settleIndex];var settleDecision=decideLayoutSettle(settleSample,previousSettleSample,{textWidth:parseFloat(settleFlow.style.inlineSize)},settleVisibleElapsed,${LAYOUT_SETTLE_MS});settlePrevious[settleIndex]=settleSample;if(settleDecision==='refuse'){fail('the measure box did not hold the configured text width with a stable scroll width within ${LAYOUT_SETTLE_MS} ms; remove author CSS that changes the composer measure box size, such as padding, border, transform or inline-size on every element, or let content whose layout keeps changing settle, to clear this refusal');return;}if(settleDecision!=='settled')settled=false;}if(!settled)return nextLayoutFrame().then(composeWhenMeasurable);
var planBookOrFail=function(input){var held=planBook(input,config.numbering);if(!held.ok){fail(held.refusals[0].message);return null;}var plan=held.plan;if(config.rules){var rows=planPrintedPages(config.rules,plan.pages.length,config.direction,config.numbering);for(var i=0;i<plan.pages.length;i++){plan.pages[i].parent=rows[i].parent;plan.pages[i].face=rows[i].face;plan.pages[i].side=rows[i].side;plan.pages[i].role=rows[i].role;}plan.folios=rows.map(function(row){return row.number;});plan.total=rows[rows.length-1].total;}return plan;};
var input=measureInput();
var plan;
var saved;
if(config.plan){planFolios={folios:config.plan.folios,total:config.plan.total};fillPageReferences(config.plan.pages);input=measureInput();var replayContinuation=measurementContinuation(input,config.plan.pages.length);if(replayContinuation)return replayContinuation===true?undefined:replayContinuation;var replayed=replayPlan(input,config.plan,config.numbering);if(!replayed.ok){fail(replayed.refusal);return;}plan=replayed.plan;planFolios=plan;}
else{plan=planBookOrFail(input);if(!plan)return;planFolios=plan;var moved=[];var convergence=convergeLayout(plan,function(previous){fillPageReferences(previous.pages);input=measureInput();var next=planBookOrFail(input);if(!next)return null;planFolios=next;moved=unsettledPageReferences(next.pages);return {plan:next,settled:moved.length===0};},3);if(!convergence)return;plan=convergence.plan;if(!convergence.converged){fail('page references to '+moved.join(', ')+' would not settle after three additional compositions; shorten the content or reserve fixed space for page references to clear this refusal');return;}if(config.savedPlans)saved=savePlan(input,plan,config.numbering);var saveContinuation=measurementContinuation(input,plan.pages.length);if(saveContinuation)return saveContinuation===true?undefined:saveContinuation;}
var setComposedHeight=function(count){var height=(count*config.geometry.paperHeight)+'px';document.documentElement.style.blockSize=height;document.body.style.blockSize=height;};
if(plan.pages.length>config.limit){fail(config.limitRefusal.template.split(config.limitRefusal.placeholder).join(String(plan.pages.length)));if(config.measure){setComposedHeight(plan.pages.length);document.documentElement.setAttribute('${COMPOSED_ATTRIBUTE}','');}return;}
if(config.expectedCount!==null&&config.expectedCount!==undefined&&plan.pages.length!==config.expectedCount){fail('the composed page count changed from '+config.expectedCount+' to '+plan.pages.length+' between measurement and paper composition; wait for the page layout to settle or shorten the content to clear this refusal');return;}
if(config.measure){setComposedHeight(plan.pages.length);document.documentElement.setAttribute('${COMPOSED_MS_ATTRIBUTE}',String(Math.round(performance.now()-composeStarted)));document.documentElement.setAttribute('${COMPOSED_ATTRIBUTE}','');return;}
if(saved)publishPlan(saved);
var composed=compose(plan,input.geometry.noteSeries||[]);
if(document.documentElement.hasAttribute('${COMPOSE_FAILURE_ATTRIBUTE}'))return;
return Promise.all([document.fonts?document.fonts.ready:Promise.resolve(),readyImages(composed)]).then(function(){if(!settleHeldNoteViews())return;presentScreen(composed,plan.pages.length);document.documentElement.setAttribute('${COMPOSED_MS_ATTRIBUTE}',String(Math.round(performance.now()-composeStarted)));document.documentElement.setAttribute('${COMPOSED_ATTRIBUTE}','');});
}catch(error){fail(error instanceof Error?error.message:String(error));}
};
return composeWhenMeasurable();
}).catch(function(error){fail(error instanceof Error?error.message:String(error));});
})();`
  return script
}

export const COMPOSER_SCRIPT = composerScript('{}')
