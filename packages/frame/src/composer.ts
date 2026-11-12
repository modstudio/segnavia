import {
  type Folio,
  HEAD_TEMPLATE_MOTIF,
  HEAD_TEMPLATE_NAME_ATTRIBUTE,
  headTemplatePlacements,
  MOTIF_ATTRIBUTE,
  type PaginateVariable,
  SECTION_BOUNDARY_CLASS,
  textHoldingParentRules,
  type Variable,
} from '@segnavia/format'
import {
  ABSOLUTE_PX,
  embedFunction,
  heldPageNumber,
  lengthPx,
  openerPageIndex,
  PAGE_REFERENCE_SELECTOR,
  pageIndexForTarget,
  parseCssLength,
  windowPageIndex,
} from '@segnavia/html'
import { layoutScript, regionBox } from '@segnavia/layout'
import { BOOK_LAYOUTS, bookPresentationScript, embeddedBookPresentationFunctions, pageGrid, pageScale, spreadSlots } from './book-presentation.ts'
import { COMPOSE_FAILURE_TEXT_LIMIT } from './bridge.ts'
import {
  embeddedDressPlanPagesFunctions,
  fillFurniture,
  fillRegion,
  fillRegionImplementation,
  markFurnitureOverflow,
  markRegionOverflow,
  resolveRegionHeads,
  resolveRegionHeadsImplementation,
} from './composer-dress.ts'
import { embeddedComposerFitFunctions } from './composer-fit.ts'
import { flowTextArea, type MeasuredLineBox } from './composer-measure.ts'
import { embeddedComposerMeasureFunctions } from './composer-measure-embed.ts'
import { embeddedPreflightFunctions } from './composer-preflight.ts'
import { embeddedComposerProgressFunctions } from './composer-progress.ts'
import { placeParentRegions } from './composer-regions.ts'
import { DIAGRAM_READY_EXPR } from './diagram-document.ts'
import { declaredFontLoadExpression } from './font-load.ts'
import { advanceVisibleTime, decideLayoutSettle, LAYOUT_SETTLE_MS } from './layout-settle.ts'
import { applyPrintedParentRules } from './printed-parent-selection.ts'
export const COMPOSED_ATTRIBUTE = 'data-segnavia-composed'
export const COMPOSED_MS_ATTRIBUTE = 'data-segnavia-composed-ms'
export const COMPOSE_FAILURE_ATTRIBUTE = 'data-segnavia-compose-failure'
export const GALLEY_PRINT_CSS = '@media print{:where([data-segnavia-galley-source]){display:none!important}}'
// A valid book normally establishes its line boxes in one layout frame. One second admits throttled or deferred browser layout while still reporting a bounded measurement failure.
export const BOOK_MEASUREMENT_WAIT_MS = 1_000
export const WINDOW_EDGE_INSET_PX = 0.25
export { fillRegion, resolveRegionHeads } from './composer-dress.ts'
export interface ScreenPresentation {
  spread: boolean
  reportPlace?: boolean
}

export function flowSectionNumbering(element: Pick<Element, 'getAttribute'>): { counted?: false; restart?: number } | undefined {
  const counted = element.getAttribute('data-numbering-counted')
  const restart = element.getAttribute('data-numbering-restart')
  if (counted !== 'false' && restart === null) return undefined
  return { counted: counted === 'false' ? false : undefined, restart: restart === null ? undefined : Number(restart) }
}

export function partTitleValues(variables: readonly Variable[], parts: Record<string, string>): PaginateVariable[] {
  var values: PaginateVariable[] = []
  var index: number
  var variable: Variable | undefined
  var value: string | undefined
  for (index = 0; index < variables.length; index += 1) {
    variable = variables[index]
    if (variable === undefined || variable.kind !== 'text' || variable.from !== 'part-title') continue
    value = Object.hasOwn(parts, variable.part) ? parts[variable.part] : undefined
    values.push({ name: variable.name, value: value === undefined ? '' : value, line: 0, scope: 'flow' })
  }
  return values
}

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

export type NoteLineBox = MeasuredLineBox

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

export function inlineTileCount(extent: number, textWidth: number): number {
  return Math.max(1, Math.ceil(extent / textWidth))
}

export type PageReferenceFolio = { folio: string } | { refusal: string }

export function pageReferenceFolio(id: string, page: number, folios: readonly (Folio | null | string)[]): PageReferenceFolio {
  const folio = folios[page - 1]
  if (folio !== undefined) return { folio: typeof folio === 'string' ? folio : (folio?.text ?? '') }
  return {
    refusal: `page reference target ${id} lands on page ${page}, beyond the ${folios.length} computed folios; shorten the book to ${folios.length} pages or fewer to clear this refusal`,
  }
}

export { flowTextArea }

export function embeddedComposerFunctions(): string {
  return `${embedFunction('textHoldingParentRules', textHoldingParentRules)}
${embedFunction('flowTextArea', flowTextArea)}
${embedFunction('applyPrintedParentRules', applyPrintedParentRules)}
${embedFunction('spreadSlots', spreadSlots)}
${embedFunction('pageScale', pageScale)}
${embedFunction('pageGrid', pageGrid)}
${embedFunction('pixelPhaseOffset', pixelPhaseOffset)}
${embedFunction('inlineTileCount', inlineTileCount)}
${embedFunction('unmeasuredFlows', unmeasuredFlows)}
${embedFunction('decideBookMeasurement', decideBookMeasurement)}
${embedFunction('advanceVisibleTime', advanceVisibleTime)}
${embedFunction('decideVisibleMeasurement', decideVisibleMeasurement)}
${embedFunction('appendMeasuredBlock', appendMeasuredBlock)}
${embedFunction('partTitleValues', partTitleValues)}
${embeddedComposerMeasureFunctions()}
${embedFunction('noteFragmentExtent', noteFragmentExtent)}
${embedFunction('noteSettlementOverlapsBody', noteSettlementOverlapsBody)}
${embedFunction('noteStackTops', noteStackTops)}
${embedFunction('fillFurniture', fillFurniture)}
${embedFunction('regionBox', regionBox)}
${embedFunction('placeParentRegions', placeParentRegions)}
var MOTIF_ATTRIBUTE=${JSON.stringify(MOTIF_ATTRIBUTE)};
var HEAD_TEMPLATE_MOTIF=${JSON.stringify(HEAD_TEMPLATE_MOTIF)};
var HEAD_TEMPLATE_NAME_ATTRIBUTE=${JSON.stringify(HEAD_TEMPLATE_NAME_ATTRIBUTE)};
${embedFunction('scanHeadTemplatePlacements', headTemplatePlacements)}
var headTemplatePlacements=function(html){return scanHeadTemplatePlacements(html,MOTIF_ATTRIBUTE,HEAD_TEMPLATE_MOTIF,HEAD_TEMPLATE_NAME_ATTRIBUTE);};
${embedFunction('fillRegionImplementation', fillRegionImplementation)}
var fillRegion=function(html,values,direction,lang){return fillRegionImplementation(html,values,headTemplatePlacements,MOTIF_ATTRIBUTE);};
var ${fillRegion.name}=fillRegion;
${embedFunction('resolveRegionHeadsImplementation', resolveRegionHeadsImplementation)}
var resolveRegionHeads=function(templates,variables,recordSlots,direction,lang){return resolveRegionHeadsImplementation(templates,variables,recordSlots,direction,lang,resolveHeadTemplate);};
var ${resolveRegionHeads.name}=resolveRegionHeads;
${embedFunction('markFurnitureOverflow', markFurnitureOverflow)}
${embedFunction('markRegionOverflow', markRegionOverflow)}
${embeddedComposerProgressFunctions()}${embeddedDressPlanPagesFunctions('progressMacrotask')}${embeddedPreflightFunctions()}${embeddedComposerFitFunctions()}
${embedFunction('decideLayoutSettle', decideLayoutSettle)}
${embeddedBookPresentationFunctions()}`
}

export function composerScript(configJson: string): string {
  const presentationConfig = (JSON.parse(configJson) as { presentation?: ScreenPresentation }).presentation
  const presentation = presentationConfig !== undefined
  const placeReporter = presentationConfig?.reportPlace ? bookPresentationScript('pages', 'scalePages();', 'config.pageMarker') : ''
  const script = `(function(){
var composeStarted=performance.now();
var fail=function(reason){var text=String(reason).slice(0,${COMPOSE_FAILURE_TEXT_LIMIT});document.documentElement.setAttribute('${COMPOSE_FAILURE_ATTRIBUTE}',text||'book composition failed without a reported reason');};
var config=${configJson};
var preflightEntries=[],fitPreflightEntries=[],preflightFits=[],fitResults=[];
var BOOK_LAYOUTS=${JSON.stringify(BOOK_LAYOUTS)};
${layoutScript()}
${embedFunction('flowSectionNumbering', flowSectionNumbering)}
${embeddedComposerFunctions()}
${embedFunction('heldPageNumber', heldPageNumber)}
${embedFunction('windowPageIndex', windowPageIndex)}
${embedFunction('openerPageIndex', openerPageIndex)}
${embedFunction('pageIndexForTarget', pageIndexForTarget)}
${embedFunction('parseCssLength', parseCssLength)}
${embedFunction('lengthPx', lengthPx)}
${embedFunction('pageReferenceFolio', pageReferenceFolio)}
var ABSOLUTE_PX=${JSON.stringify(ABSOLUTE_PX)};
var elementWithAttr=function(root,attr,value){var nodes=root.querySelectorAll('['+attr+']');for(var i=0;i<nodes.length;i++){if(nodes[i].getAttribute(attr)===value)return nodes[i];}return null;};
var readyImages=function(root){var images=Array.from(root.querySelectorAll('img,image'));return Promise.all(images.map(function(image){if(image.tagName.toLowerCase()==='img'&&image.decode)return image.decode().catch(function(){});if(image.tagName.toLowerCase()==='img'&&image.complete)return Promise.resolve();return new Promise(function(resolve){image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});});}));};
try{
var geometryByName={};var configuredGeometries=config.geometries;var defaultGeometry=configuredGeometries[0];for(var geometryIndex=1;geometryIndex<configuredGeometries.length;geometryIndex++){var configuredGeometry=configuredGeometries[geometryIndex];geometryByName[configuredGeometry.name]=configuredGeometry;}
var geometryFor=function(name){if(name===undefined||name===null||name==='')return defaultGeometry;var geometry=geometryByName[name];if(!geometry)throw new Error('page geometry '+JSON.stringify(name)+' is not configured; declare it in style.pageGeometries, or remove pageGeometry to clear this refusal');return geometry;};
var parentsFor=function(geometry){var parents={};var source=geometry.parents;for(var parentIndex=0;parentIndex<source.length;parentIndex++)parents[source[parentIndex].name]=source[parentIndex];return parents;};
var parentFor=function(geometry,name){return parentsFor(geometry)[name];};
document.documentElement.setAttribute('data-segnavia-parent-margins',JSON.stringify(defaultGeometry.parents.map(function(parent){return {name:parent.name,margin:parent.margin};})));
var columnWidth=function(columns,textWidth,gap){if(columns<=1)return textWidth;return (textWidth-(columns-1)*gap)/columns;};
var sizeGalleys=function(){var flows=document.querySelectorAll('[data-segnavia-flow]');for(var f=0;f<flows.length;f++){if(flows[f].getAttribute('data-segnavia-kind')==='fixed'||flows[f].getAttribute('data-segnavia-kind')==='templated')continue;var geometry=geometryFor(flows[f].getAttribute('data-page-geometry'));var areas={};var geometryParents=geometry.parents;for(var p=0;p<geometryParents.length;p++)areas[geometryParents[p].name]=geometryParents[p].textArea;var area=flowTextArea(parentsOf(flows[f])||undefined,areas,flowKind(flows[f]),undefined,defaultParentRules);sizeFlowGalley(flows[f],area.width,area.height,config.orphans,config.widows);var blocks=flows[f].children;for(var b=0;b<blocks.length;b++){var columnsAttr=blocks[b].getAttribute('data-columns');if(columnsAttr){var style=getComputedStyle(blocks[b]);var margins=(parseFloat(style.marginInlineStart)||0)+(parseFloat(style.marginInlineEnd)||0);blocks[b].style.boxSizing='border-box';blocks[b].style.inlineSize=(columnWidth(parseInt(columnsAttr,10),area.width,geometry.columnGap)-margins)+'px';}var refs=blocks[b].querySelectorAll('a[href^="#"]');for(var r=0;r<refs.length;r++){var note=document.querySelector('[data-segnavia-note="'+refs[r].getAttribute('href').slice(1)+'"]');if(note){note.style.inlineSize=area.width+'px';note.style.setProperty('--segnavia-text-height',area.height+'px');}}}}};
var originTop=function(element){return element.getBoundingClientRect().top;};
var blockLines=measureLineBoxes;
var lineIndex=function(top,lines){var index=0;for(var i=0;i<lines.length;i++){if(top>=lines[i].top-0.5&&top<lines[i].bottom+0.5)return i;if(lines[i].top<=top)index=i;}return index;};
var blockKind=function(tag){if(/^h[1-6]$/.test(tag))return 'heading';if(tag==='table')return 'table';if(tag==='figure'||tag==='img')return 'figure';return 'text';};
var chapterOf=function(element){return Number(element.getAttribute('data-segnavia-chapter')||0);};
var flowKind=function(element){if(element.getAttribute('data-segnavia-kind')==='fixed')return 'fixed';if(element.getAttribute('data-segnavia-kind')==='templated')return 'templated';if(element.getAttribute('data-segnavia-kind')==='part')return 'part';if(element.classList.contains('segnavia-contents'))return 'contents';if(element.classList.contains('segnavia-front'))return 'front';if(element.classList.contains('segnavia-endnotes'))return 'endnotes';return 'chapter';};
var parentsOf=function(element){if(!element)return null;var rules=element.getAttribute('data-segnavia-parent-rules');return rules?JSON.parse(rules):null;};
var withFlowMeta=function(flow,element){var opens=element.getAttribute('data-opens');if(opens)flow.opens=opens;var rules=parentsOf(element);if(rules)flow.parentRules=rules;var sequence=element.getAttribute('data-sequence');if(sequence)flow.sequence=sequence;var numbering=flowSectionNumbering(element);if(numbering)flow.numbering=numbering;var recordIndex=element.getAttribute('data-record-index');var recordCount=element.getAttribute('data-record-count');if(recordIndex&&recordCount)flow.record={index:Number(recordIndex),count:Number(recordCount)};var pageGeometry=element.getAttribute('data-page-geometry');if(pageGeometry)flow.pageGeometry=pageGeometry;var columns=geometryFor(pageGeometry).columnCount||1;for(var i=0;i<(flow.blocks||[]).length;i++)if(flow.blocks[i].columns===undefined&&columns>1)flow.blocks[i].columns=columns;return flow;};
var measureVariables=function(block,lines,origin){var nodes=[];if(block.hasAttribute('data-variable'))nodes.push(block);var inner=block.querySelectorAll('[data-variable]');for(var i=0;i<inner.length;i++)nodes.push(inner[i]);var values=[];for(var n=0;n<nodes.length;n++){var name=nodes[n].getAttribute('data-variable');if(!name)continue;var declaration=(config.variables||[]).find(function(variable){return variable.kind==='text'&&variable.from==='content'&&variable.name===name;});if(!declaration)continue;var top=nodes[n].getBoundingClientRect().top-origin;values.push({name:name,value:(nodes[n].textContent||'').replace(/\\s+/g,' ').trim(),line:lineIndex(top,lines)});}var titleNodes=[];if(block.hasAttribute('data-segnavia-section-title'))titleNodes.push(block);var titles=block.querySelectorAll('[data-segnavia-section-title]');for(var t=0;t<titles.length;t++)titleNodes.push(titles[t]);return values.concat(sectionTitleValues(titleNodes,lines,origin));};
var sectionTitleValues=function(titleNodes,lines,origin){var values=[];for(var d=0;d<(config.variables||[]).length;d++){var titleVariable=config.variables[d];if(titleVariable.kind!=='text'||titleVariable.from!=='section-title')continue;for(var s=0;s<titleNodes.length;s++){var titleTop=titleNodes[s].getBoundingClientRect().top-origin;values.push({name:titleVariable.name,value:titleNodes[s].getAttribute('data-segnavia-section-title')||'',line:lineIndex(titleTop,lines),scope:'flow'});}}return values;};
var measureRefs=function(block,lines,origin){var nodes=block.querySelectorAll('.segnavia-note-ref > a');var refs=[];for(var i=0;i<nodes.length;i++){if(nodes[i].parentElement&&nodes[i].parentElement.hasAttribute('data-segnavia-note-repeat'))continue;var href=nodes[i].getAttribute('href')||'';if(href.charAt(0)!=='#')continue;var note=elementWithAttr(document,'data-segnavia-note',href.slice(1));if(!note||!note.closest('[data-segnavia-notes-galley]'))continue;var top=nodes[i].getBoundingClientRect().top-origin;refs.push({note:href.slice(1),line:lineIndex(top,lines)});}return refs;};
var keepSignalValues=function(style,keepWith){return {breakInside:style.breakInside,pageBreakInside:style.pageBreakInside,breakAfter:style.breakAfter,pageBreakAfter:style.pageBreakAfter,breakBefore:style.breakBefore,pageBreakBefore:style.pageBreakBefore,keepWith:keepWith};};
var descendantKeepCandidates=function(element,origin,elementStyle){var candidates=[];var styles=new WeakMap();styles.set(element,elementStyle);var styleOf=function(descendant){var held=styles.get(descendant);if(held)return held;var measured=getComputedStyle(descendant);styles.set(descendant,measured);return measured;};var descendants=element.querySelectorAll('*');for(var i=0;i<descendants.length;i++){var style=styleOf(descendants[i]);if(skippableDescendantBoxDisplay(style.display))continue;var keepWith=(style.getPropertyValue('--segnavia-keep-with')||'').trim();var parent=descendants[i].parentElement;var parentKeepWith=parent?(styleOf(parent).getPropertyValue('--segnavia-keep-with')||'').trim():'';var signals=descendantKeepSignals(keepSignalValues(style,keepWith),parentKeepWith);if(!signals.avoidInside&&!signals.keepWithNext&&!signals.keepWithPrevious)continue;var box=descendants[i].getBoundingClientRect();candidates.push({top:box.top-origin,bottom:box.bottom-origin,avoidInside:signals.avoidInside,keepWithNext:signals.keepWithNext,keepWithPrevious:signals.keepWithPrevious});}return candidates;};
var measureBlock=function(element,flowId,chapter,index,origin){var tag=element.tagName.toLowerCase();var style=getComputedStyle(element);var lines=blockLines(element,origin);if(!lines.length)return null;lines=applyBoxDecorations(lines,measuredDecorationBoxes(element,origin,style));var keepWith=(style.getPropertyValue('--segnavia-keep-with')||'').trim();var signals=keepSignals(keepSignalValues(style,keepWith));var columnsAttr=element.getAttribute('data-columns');var orphans=parseInt(style.orphans,10);var widows=parseInt(style.widows,10);var header=headerHeightFor(element);var block={kind:blockKind(tag),tag:tag,position:{chapter:chapter,block:index},lines:lines};var id=element.getAttribute('data-segnavia-id');if(id!==null)block.id=id;if(columnsAttr)block.columns=parseInt(columnsAttr,10);var constraints=measuredBlockConstraints(style.display,orphans,widows);if(constraints.orphans)block.orphans=constraints.orphans;if(constraints.widows)block.widows=constraints.widows;if(signals.keepWithNext)block.keepWithNext=true;if(signals.keepWithPrevious)block.keepWithPrevious=true;if(forcedPageBreak(style.breakBefore))block.breakBefore=true;if(forcedPageBreak(style.breakAfter))block.breakAfter=true;if(signals.avoidInside)block.keepTogether=true;var keeps=measuredKeepRuns(lines,descendantKeepCandidates(element,origin,style));if(keeps.keepRuns.length)block.keepRuns=keeps.keepRuns;if(keeps.keepWithNextFrom!==undefined&&!block.keepWithNext){block.keepWithNext=true;block.keepWithNextFrom=keeps.keepWithNextFrom;}if(keeps.keepWithPrevious)block.keepWithPrevious=true;if(header>0)block.headerHeight=header;var refs=measureRefs(element,lines,origin);if(refs.length)block.footnoteRefs=refs;var variables=measureVariables(element,lines,origin);if(variables.length)block.variables=variables;return block;};
var contentBearing=function(element){if(getComputedStyle(element).display==='none')return false;if((element.textContent||'').trim()!=='')return true;var replaced='img,svg,video,canvas,picture,iframe,object,embed,math';if(element.matches(replaced)||element.querySelector(replaced))return true;var tag=element.tagName.toLowerCase();return (tag==='table'&&element.querySelector('tr')!==null)||element.querySelector('table tr')!==null;};
var measureFlow=function(element){var id=element.getAttribute('data-segnavia-flow')||element.id;var kind=flowKind(element);if(kind==='fixed'||kind==='templated'){var selector=kind==='templated'?'[data-segnavia-templated-page]':'[data-segnavia-designed-page]';var holders=element.querySelectorAll(selector);var fixed={id:id,kind:'fixed',pages:holders.length,sourceBlocks:0,contentBlocks:0};if(kind==='templated'){fixed.role='body';fixed.pageParentRules=[];for(var h=0;h<holders.length;h++){var templateName=holders[h].getAttribute('data-template');fixed.pageParentRules.push(mergeParents(parentsOf(element),parentsOf(templateName?elementWithAttr(document,'data-segnavia-template',templateName):null)));}}return withFlowMeta(fixed,element);}var origin=originTop(element);var chapter=chapterOf(element);var blocks=[];var index=0;var sourceBlocks=0;var contentBlocks=0;var boundaries=[];var flowTitled=element.hasAttribute('data-segnavia-section-title');var partData=element.getAttribute('data-segnavia-parts');var parts=partData?JSON.parse(partData):{};var flowStarted=true;for(var i=0;i<element.children.length;i++){var child=element.children[i];if(child.tagName==='STYLE'||child.tagName==='SCRIPT')continue;if(child.classList.contains('${SECTION_BOUNDARY_CLASS}')){chapter=chapterOf(child);index=0;boundaries=[child];continue;}index+=1;sourceBlocks+=1;if(contentBearing(child))contentBlocks+=1;var block=measureBlock(child,id,chapter,index,origin);if(block){var heldVariables=flowStarted?partTitleValues(config.variables||[],parts):[];flowStarted=false;if(flowTitled)heldVariables=heldVariables.concat(sectionTitleValues([element],block.lines,origin));flowTitled=false;for(var m=0;m<boundaries.length;m++)heldVariables=heldVariables.concat(measureVariables(boundaries[m],block.lines,origin));if(heldVariables.length)block.variables=heldVariables.concat(block.variables||[]);boundaries=[];appendMeasuredBlock(blocks,block);}}var flow={id:id,kind:kind,blocks:blocks,sourceBlocks:sourceBlocks,contentBlocks:contentBlocks};return withFlowMeta(flow,element);};
var measureNotes=function(){var notes=[];var nodes=document.querySelectorAll('[data-segnavia-galleys] [data-segnavia-note]');for(var i=0;i<nodes.length;i++){var id=nodes[i].getAttribute('data-segnavia-note');var galley=nodes[i].closest('[data-segnavia-notes-galley]');var series=galley?galley.getAttribute('data-segnavia-note-series'):'';if(!id||!series)continue;notes.push({id:id,series:series,lines:blockLines(nodes[i],originTop(nodes[i]))});}return notes;};
var noteGap=function(root){var style=getComputedStyle(root);return (parseFloat(style.borderBlockStartWidth)||0)+(parseFloat(style.paddingBlockStart)||0)+(parseFloat(style.marginBlockStart)||0);};
var noteSeries=function(){var series=[];var nodes=document.querySelectorAll('[data-segnavia-notes-galley]');for(var i=0;i<nodes.length;i++){var name=nodes[i].getAttribute('data-segnavia-note-series');if(name)series.push({name:name,gap:noteGap(nodes[i])});}return series;};
var measureInput=function(){var flows=[];var nodes=document.querySelectorAll('[data-segnavia-galleys] [data-segnavia-flow]');for(var i=0;i<nodes.length;i++)flows.push(measureFlow(nodes[i]));var parents={};for(var p=0;p<defaultGeometry.parents.length;p++)parents[defaultGeometry.parents[p].name]=defaultGeometry.parents[p].textArea;var geometryParents={};var pageGeometries={};for(var g=1;g<configuredGeometries.length;g++){var geometry=configuredGeometries[g];var name=geometry.name;pageGeometries[name]={width:geometry.paperWidth,height:geometry.paperHeight};geometryParents[name]={};for(var gp=0;gp<geometry.parents.length;gp++)geometryParents[name][geometry.parents[gp].name]=geometry.parents[gp].textArea;}return measurementsWithBreaks({...config.document?{document:config.document}:{},fits:fitResults,variables:config.variables||[],flows:flows,notes:measureNotes(),geometry:{notesGap:config.notesGap,noteSeries:noteSeries()},parents:parents,geometryParents:geometryParents,pageGeometries:pageGeometries,settings:{orphans:config.orphans,widows:config.widows,rectoOpenings:config.rectoOpenings,direction:config.direction,endnotePlacement:config.endnotePlacement}},config.breaks||(config.plan&&config.plan.breaks)||[]);};
var planFolios={folios:[],total:'0'};
var folioOf=function(index){return planFolios.folios[index];};
var pageForTarget=function(id,pages){var element=document.getElementById(id);var index;if(!element){index=pageIndexForTarget(pages,{flow:id});}else{var flow=element.closest('[data-segnavia-flow]');if(!flow)return '';var flowId=flow.getAttribute('data-segnavia-flow')||'';var holder=element.closest('[data-segnavia-designed-page],[data-segnavia-templated-page]');var heldPage=holder?Number(holder.getAttribute('data-segnavia-designed-page')||holder.getAttribute('data-segnavia-templated-page')):undefined;var target={flow:flowId};if(heldPage)target.heldPage=heldPage;else target.top=element.getBoundingClientRect().top-originTop(flow);index=pageIndexForTarget(pages,target);}if(index===undefined)return '';var result=pageReferenceFolio(id,index+1,planFolios.folios);if(result.refusal){fail(result.refusal);return '';}return result.folio;};
var pageReferences=function(){return document.querySelectorAll('${PAGE_REFERENCE_SELECTOR}');};
var pageReferenceId=function(node){var href=node.getAttribute('href')||'';return href.charAt(0)==='#'?href.slice(1):href.slice('segnavia:target/'.length);};
var fillPageReferences=function(pages){var nodes=pageReferences();for(var i=0;i<nodes.length;i++){var id=pageReferenceId(nodes[i]);var folio=pageForTarget(id,pages);nodes[i].textContent=folio;nodes[i].setAttribute('dir',resolveDirection(config.dir,config.lang,folio));}};
var unsettledPageReferences=function(pages){var nodes=pageReferences();var ids=[];for(var i=0;i<nodes.length;i++){var id=pageReferenceId(nodes[i]);if(nodes[i].textContent!==pageForTarget(id,pages)&&ids.indexOf(id)<0)ids.push(id);}return ids;};
var mergeParents=function(section,template){return section||template||undefined;};
var stripIds=function(clone,original,win,origin){var consider=function(node,source){if(!node.getAttribute('id'))return;var sourceLines=blockLines(source,origin);var top=sourceLines.length?sourceLines[0].top:source.getBoundingClientRect().top-origin;if(!(top>=win.start&&top<win.end))node.removeAttribute('id');};consider(clone,original);var ids=clone.querySelectorAll('[id]');var sources=original.querySelectorAll('[id]');for(var i=0;i<ids.length;i++){var source=sources[i];if(!source){ids[i].removeAttribute('id');continue;}consider(ids[i],source);}};
var blockExtent=function(element,origin){var lines=blockLines(element,origin);if(!lines.length){var box=element.getBoundingClientRect();return {top:box.top-origin,bottom:box.bottom-origin};}return {top:lines[0].top,bottom:lines[lines.length-1].bottom};};
var flowInlineStart=function(flow,child){var flowBox=flow.getBoundingClientRect();var childBox=child.getBoundingClientRect();return config.direction==='rtl'?flowBox.right-childBox.right:childBox.left-flowBox.left;};
var placeHeader=function(area,page,textArea,geometry){if(!page.headerRepeat)return;for(var w=0;w<page.windows.length;w++){var win=page.windows[w];var flow=document.querySelector('[data-segnavia-flow="'+win.flow+'"]');if(!flow)continue;var origin=originTop(flow);var children=flow.children;for(var i=0;i<children.length;i++){var child=children[i];var table=headerTableFor(child);if(!table||!table.tHead)continue;var extent=blockExtent(child,origin);if(!(extent.top<win.start&&extent.bottom>win.start))continue;var width=columnWidth(win.columns,textArea.width,geometry.columnGap);var view=document.createElement('div');view.setAttribute('data-segnavia-table-header','');view.style.cssText='position:absolute;overflow:clip;inset-block-start:'+(win.top-page.headerRepeat)+'px;inset-inline-start:'+(win.column*(width+geometry.columnGap))+'px;inline-size:'+width+'px;block-size:'+page.headerRepeat+'px';var held=table.cloneNode(true);held.removeAttribute('id');var ids=held.querySelectorAll('[id]');for(var n=0;n<ids.length;n++)ids[n].removeAttribute('id');held.style.position='absolute';held.style.insetBlockStart='0';held.style.marginBlockStart='0';held.style.insetInlineStart=(flowInlineStart(flow,table)-(page.inlineTile||0)*textArea.width)+'px';held.style.inlineSize=table.getBoundingClientRect().width+'px';view.append(held);area.append(view);break;}}};
var placeWindow=function(area,win,keepFlowId,textArea,inlineTile,geometry){var flow=document.querySelector('[data-segnavia-flow="'+win.flow+'"]');if(!flow)return;var height=win.end-win.start;var width=columnWidth(win.columns,textArea.width,geometry.columnGap);var view=document.createElement('div');view.setAttribute('data-segnavia-window','');view.setAttribute('data-flow',win.flow);view.setAttribute('data-start',String(win.start));view.setAttribute('data-end',String(win.end));view.setAttribute('data-top',String(win.top));view.setAttribute('data-column',String(win.column));view.setAttribute('data-columns',String(win.columns));view.style.cssText='position:absolute;overflow:clip;inset-block-start:'+win.top+'px;inset-inline-start:'+(win.column*(width+geometry.columnGap))+'px;inline-size:'+width+'px;block-size:'+height+'px';var clone=flow.cloneNode(false);if(!keepFlowId)clone.removeAttribute('id');clone.style.position='absolute';clone.style.visibility='visible';clone.style.insetBlockStart=(-win.start)+'px';clone.style.insetInlineStart=(-inlineTile*textArea.width)+'px';clone.style.inlineSize=textArea.width+'px';var origin=originTop(flow);var placed=0;var children=flow.children;for(var i=0;i<children.length;i++){var child=children[i];if(child.tagName==='STYLE'||child.tagName==='SCRIPT')continue;var extent=blockExtent(child,origin);if(!(extent.bottom>win.start&&extent.top<win.end))continue;if(placed===0){var firstTop=child.getBoundingClientRect().top-origin;if(firstTop>0){var spacer=document.createElement('div');spacer.setAttribute('data-segnavia-window-spacer','');spacer.style.cssText='display:block;block-size:0;padding-block-start:'+firstTop+'px;margin:0;border:0;overflow:hidden;';clone.append(spacer);}}var held=child.cloneNode(true);var childStyle=getComputedStyle(child);if(forcedPageBreak(childStyle.breakBefore))held.style.breakBefore='auto';if(forcedPageBreak(childStyle.breakAfter))held.style.breakAfter='auto';held.setAttribute('data-segnavia-block',String(i));if(placed===0)held.style.marginBlockStart='0';stripIds(held,child,win,origin);clone.append(held);placed+=1;}view.append(clone);area.append(view);};
var placeDesigned=function(paper,page,index,pages){if(page.role!=='fixed')return;var m=heldPageNumber(pages,index);var section=document.querySelector('[data-segnavia-flow="'+page.flow+'"]');var holder=section&&section.querySelector('[data-segnavia-designed-page="'+m+'"]');if(!holder)return;var clone=holder.cloneNode(true);clone.removeAttribute('hidden');clone.removeAttribute('data-segnavia-designed-page');clone.style.cssText='position:absolute;inset-block-start:0;inset-block-end:0;inset-inline-start:0;inset-inline-end:0;overflow:hidden;direction:'+(section.getAttribute('dir')||config.direction);var lang=section.getAttribute('lang')||config.lang;if(lang)clone.setAttribute('lang',lang);if(m===1&&section.id)clone.id=section.id;paper.append(clone);};
var regionExcess=inkExcess;
var placeTemplated=function(text,page,index,pages){var flow=document.querySelector('[data-segnavia-flow="'+page.flow+'"]');if(!flow||flow.getAttribute('data-segnavia-kind')!=='templated'||page.blank)return;var m=heldPageNumber(pages,index);var holder=flow.querySelector('[data-segnavia-templated-page="'+m+'"]');if(!holder)return;var name=holder.getAttribute('data-template')||'';var template=elementWithAttr(document,'data-segnavia-template',name);if(!template)return;var clone=template.cloneNode(true);clone.removeAttribute('hidden');clone.removeAttribute('data-segnavia-template');clone.removeAttribute('data-segnavia-parent-rules');clone.style.cssText='position:absolute;inset-block-start:0;inset-block-end:0;inset-inline-start:0;inset-inline-end:0;overflow:visible;direction:'+(flow.getAttribute('dir')||config.direction);var lang=flow.getAttribute('lang')||config.lang;if(lang)clone.setAttribute('lang',lang);fillTemplateRegions(clone,holder);clone.setAttribute('data-template',name);if(m===1&&flow.id)clone.id=flow.id;text.append(clone);};
var holdNote=function(root,continued,inlineSize){var clone=root.cloneNode(true);if(continued){clone.removeAttribute('id');var ids=clone.querySelectorAll('[id]');for(var i=0;i<ids.length;i++)ids[i].removeAttribute('id');}clone.style.position='absolute';clone.style.insetInlineStart='0';clone.style.inlineSize=inlineSize+'px';return clone;};
var positionHeldNotePieces=function(pieces,tops){for(var i=0;i<pieces.length;i++){pieces[i].view.style.insetBlockStart=tops[i]+'px';pieces[i].view.style.blockSize=pieces[i].height+'px';pieces[i].clone.style.insetBlockStart=(-pieces[i].start)+'px';}};
var placeNotes=function(area,fragments,textArea,seriesGeometry){if(!fragments.length)return;var pieces=[];var previousSeries='';for(var i=0;i<fragments.length;i++){var root=document.querySelector('[data-segnavia-note="'+fragments[i].id+'"]');if(!root)continue;var lines=blockLines(root,originTop(root));var extent=noteFragmentExtent(lines,fragments[i].start,fragments[i].end);if(!extent)continue;var gap=0;if(fragments[i].series!==previousSeries){for(var s=0;s<seriesGeometry.length;s++)if(seriesGeometry[s].name===fragments[i].series){gap=seriesGeometry[s].gap;break;}}var height=extent.end-extent.start;var view=document.createElement('div');view.setAttribute('data-segnavia-page-note',fragments[i].id);view.setAttribute('data-segnavia-note-lines',String(fragments[i].end-fragments[i].start));view.setAttribute('data-segnavia-note-total-lines',String(lines.length));view.setAttribute('data-segnavia-note-start',String(fragments[i].start));view.setAttribute('data-segnavia-note-end',String(fragments[i].end));view.setAttribute('data-segnavia-note-gap',String(gap));view.setAttribute('data-segnavia-note-planned-height',String(height));view.style.cssText='position:absolute;overflow:clip;inset-inline-start:0;inline-size:100%';var clone=holdNote(root,fragments[i].start!==0,textArea.width);view.append(clone);area.append(view);pieces.push({view:view,clone:clone,start:extent.start,height:height,gap:gap});previousSeries=fragments[i].series;}if(!pieces.length)return;var tops=noteStackTops(textArea.height,pieces);area.setAttribute('data-segnavia-note-planned-top',String(tops[0]));positionHeldNotePieces(pieces,tops);};
var alignWindowPhases=function(){var views=document.querySelectorAll('[data-segnavia-pages] [data-segnavia-window]');for(var i=0;i<views.length;i++){var view=views[i];var flow=document.querySelector('[data-segnavia-galley-source] [data-segnavia-flow="'+view.getAttribute('data-flow')+'"]');if(!flow)continue;var source=flow.getBoundingClientRect().top+Number(view.getAttribute('data-start'));var placed=view.getBoundingClientRect().top;view.style.insetBlockStart=(parseFloat(view.style.insetBlockStart)+pixelPhaseOffset(source,placed))+'px';var clone=view.firstElementChild;if(clone)clone.style.insetBlockStart=(parseFloat(clone.style.insetBlockStart)+${WINDOW_EDGE_INSET_PX})+'px';}};
var alignHeldNotes=function(){var views=document.querySelectorAll('[data-segnavia-pages] [data-segnavia-page-note]');for(var i=0;i<views.length;i++){var view=views[i];var clone=view.firstElementChild;var id=view.getAttribute('data-segnavia-page-note');var source=document.querySelector('[data-segnavia-galley-source] [data-segnavia-note="'+id+'"]');if(!clone||!source){fail('a page note could not be matched to its galley source; keep data-segnavia-note on the galley note to clear this refusal');return false;}var sourceLines=blockLines(source,originTop(source));var cloneLines=blockLines(clone,originTop(clone));if(!sourceLines.length||sourceLines.length!==cloneLines.length){fail('a page note clone does not have the galley note line boxes; keep the clone contents and width so the lines match to clear this refusal');return false;}var delta=cloneLines[0].top-sourceLines[0].top;for(var n=1;n<sourceLines.length;n++){if(Math.abs((cloneLines[n].top-sourceLines[n].top)-delta)>0.5){fail('a page note lines do not share one offset from the galley; the clone must keep the galley line boxes except for a single collapsing-margin shift to clear this refusal');return false;}}clone.style.insetBlockStart=(parseFloat(clone.style.insetBlockStart)-delta)+'px';}return true;};
var settleHeldNoteViews=function(){var areas=document.querySelectorAll('[data-segnavia-pages] [data-segnavia-text]');for(var a=0;a<areas.length;a++){var views=areas[a].querySelectorAll(':scope > [data-segnavia-page-note]');var pieces=[];for(var i=0;i<views.length;i++){var view=views[i];var clone=view.firstElementChild;var id=view.getAttribute('data-segnavia-page-note')||'';if(!clone){fail('the placed page note '+id+' has no held clone; keep its held clone in the note view to clear this refusal');return 'failed';}var lines=blockLines(clone,originTop(clone));var plannedCount=Number(view.getAttribute('data-segnavia-note-total-lines'));if(lines.length!==plannedCount){fail('the page note '+id+' planned '+plannedCount+' lines but its held clone has '+lines.length+' lines; the note lines changed after pagination, so keep its contents, width, and line metrics stable to clear this refusal');return 'failed';}var extent=noteFragmentExtent(lines,Number(view.getAttribute('data-segnavia-note-start')),Number(view.getAttribute('data-segnavia-note-end')));if(!extent){fail('the page note '+id+' could not re-derive its planned fragment from '+plannedCount+' held line boxes; keep its planned line range in the held clone to clear this refusal');return 'failed';}pieces.push({view:view,clone:clone,start:extent.start,height:extent.end-extent.start,gap:Number(view.getAttribute('data-segnavia-note-gap'))});}if(!pieces.length)continue;var tops=noteStackTops(parseFloat(areas[a].style.blockSize),pieces);var plannedStackTop=Number(areas[a].getAttribute('data-segnavia-note-planned-top'));var settledStackTop=tops[0];var windows=areas[a].querySelectorAll(':scope > [data-segnavia-window]');var bodyEnd=0;for(var w=0;w<windows.length;w++){var bottom=parseFloat(windows[w].style.insetBlockStart)+windows[w].getBoundingClientRect().height;if(bottom>bodyEnd)bodyEnd=bottom;}if(noteSettlementOverlapsBody(plannedStackTop,settledStackTop,bodyEnd))return 'overlap';positionHeldNotePieces(pieces,tops);}return 'settled';};
${
  presentation
    ? `var presentScreen=function(pages,count){if(!config.presentation)return;var spread=config.presentation.spread;var shown=Array.from(pages.querySelectorAll('['+config.pageMarker+']'));var sizes=shown.map(function(page){return {width:page.getBoundingClientRect().width,height:page.getBoundingClientRect().height};});var grid=pageGrid(sizes,spread);var columns=grid.columns;if(spread&&grid.slots>0){var blank=document.createElement('div');blank.setAttribute('data-segnavia-spread-blank','');blank.style.cssText='inline-size:'+grid.width+'px;block-size:'+grid.height+'px';pages.insertBefore(blank,pages.firstChild);}for(var i=0;i<shown.length;i++){shown[i].style.alignSelf='center';var face=shown[i].getAttribute('data-segnavia-side');var left=config.direction==='ltr'?face==='verso':face==='recto';if(spread)shown[i].style.justifySelf=left?'end':'start';else shown[i].style.justifySelf='center';}pages.style.cssText='position:absolute;display:grid;grid-template-columns:repeat('+columns+','+grid.width+'px);grid-auto-rows:'+grid.height+'px;align-items:center;inline-size:'+(columns*grid.width)+'px;block-size:'+Math.ceil(grid.slots/columns)*grid.height+'px;direction:'+config.direction+';transform-origin:top '+(config.direction==='rtl'?'right':'left')+';';document.documentElement.style.cssText+=';overflow:auto;block-size:100%';document.body.style.cssText='position:relative;overflow-x:hidden;min-block-size:0;';var scalePages=function(){var height=Math.ceil(grid.slots/columns)*grid.height;var scale=pageScale(document.documentElement.getBoundingClientRect().width,grid.width,columns);pages.style.transform='scale('+scale+')';pages.style.left=config.direction==='rtl'?'auto':'0';pages.style.right=config.direction==='rtl'?'0':'auto';document.body.style.blockSize=height*scale+'px';};scalePages();${placeReporter}if(typeof ResizeObserver==='function')new ResizeObserver(scalePages).observe(document.documentElement);else window.addEventListener('resize',scalePages);};
`
    : 'var presentScreen=function(){};'
}
var compose=async function(plan,seriesGeometry){preflightEntries=(config.preflightSeed||[]).slice();preflightEntries=preflightEntries.concat(fitPreflightEntries);if(config.preflight&&config.preflight['font-missing']!=='off')preflightEntries=preflightEntries.concat(fontMissingEntries(loadedFontFailures));var composedHeight=0;var pages=await dressPlanPages(plan,config.only,reportComposeProgress,function(pages,page,index){var geometry=geometryFor(page.pageGeometry);var folio=folioOf(index);var selected={parent:page.parent,side:page.side};var parent=parentFor(geometry,selected.parent);var margin=parent.margin;var textArea=parent.textArea;var paper=document.createElement('section');paper.setAttribute(config.pageMarker,String(index+1));for(var pageAttributeIndex=0;pageAttributeIndex<(config.pageAttributes||[]).length;pageAttributeIndex++)paper.setAttribute(config.pageAttributes[pageAttributeIndex],'');paper.setAttribute('data-segnavia-role',page.role);paper.setAttribute('data-segnavia-side',page.face);paper.setAttribute('data-segnavia-sequence',page.sequence);paper.setAttribute('data-segnavia-number',String(page.number));paper.setAttribute('data-segnavia-flow',page.flow);paper.setAttribute('data-segnavia-parent',parent.name);if(page.pageGeometry!==undefined)paper.setAttribute('data-segnavia-page-geometry',page.pageGeometry);paper.setAttribute('data-segnavia-folio',folio||'');paper.style.cssText='position:relative;box-sizing:border-box;inline-size:'+geometry.paperWidth+'px;block-size:'+geometry.paperHeight+'px;overflow:hidden;break-after:page;direction:'+config.direction+';page:'+geometry.pageName+';';composedHeight+=geometry.paperHeight;var inlineStart=(selected.side==='right')===(config.direction==='ltr')?margin.inlineStart:margin.inlineEnd;var text=document.createElement('div');text.setAttribute('data-segnavia-text','');text.style.cssText='position:absolute;overflow:visible;inset-block-start:'+margin.blockStart+'px;inset-inline-start:'+inlineStart+'px;inline-size:'+textArea.width+'px;block-size:'+textArea.height+'px';var seenFlows={};for(var w=0;w<page.windows.length;w++){var keepFlowId=!seenFlows[page.windows[w].flow];seenFlows[page.windows[w].flow]=true;placeWindow(text,page.windows[w],keepFlowId&&page.sectionOpening,textArea,page.inlineTile||0,geometry);}placeHeader(text,page,textArea,geometry);placeNotes(text,page.notes,textArea,seriesGeometry);paper.append(text);placeDesigned(paper,page,index,plan.pages);placeTemplated(text,page,index,plan.pages);placeParentRegions(paper,parent,page,config,regionBox,resolveRegionHeads,fillFurniture,document.createElement.bind(document));pages.append(paper);});var galleys=document.querySelector('[data-segnavia-galleys]');if(galleys){galleys.setAttribute('data-segnavia-galley-source','');galleys.style.cssText='position:absolute;inset-inline-start:-10000px;visibility:visible;';var held=galleys.querySelectorAll('[id]');for(var i=0;i<held.length;i++)held[i].removeAttribute('id');}document.body.append(pages);if(config.preflight){var furnitureRegions=pages.querySelectorAll('[data-segnavia-region]');for(var furnitureIndex=0;furnitureIndex<furnitureRegions.length;furnitureIndex++){var furniturePage=furnitureRegions[furnitureIndex].closest('['+config.pageMarker+']');if(furniturePage)markFurnitureOverflow(furnitureRegions[furnitureIndex],furniturePage,preflightEntries);}if(config.preflight['css-var-invalid']!=='off')markFurnitureInvalidVariables(pages,preflightEntries,getComputedStyle);}alignWindowPhases();if(!alignHeldNotes())return pages;var filled=pages.querySelectorAll('[data-template]');for(var t=0;t<filled.length;t++){if(config.preflight){var paper=filled[t].closest('['+config.pageMarker+']');markRegionOverflow(filled[t],paper?paper.getAttribute('data-segnavia-folio')||'':'',regionExcess,preflightEntries);}}var height=composedHeight+'px';document.documentElement.style.blockSize=height;document.body.style.blockSize=height;return pages;};
var measurementFlows=function(input){var facts=[];for(var i=0;i<input.flows.length;i++){var flow=input.flows[i];var lines=0;var blocks=flow.blocks||[];for(var b=0;b<blocks.length;b++)lines+=blocks[b].lines.length;facts.push({id:flow.id,sourceBlocks:flow.sourceBlocks,contentBlocks:flow.contentBlocks,measuredLines:lines});}return facts;};
var inlineTilesForPage=function(page){var tiles=1;for(var w=0;w<page.windows.length;w++){var win=page.windows[w];var flow=document.querySelector('[data-segnavia-flow="'+win.flow+'"]');if(!flow)continue;var parent=parentFor(geometryFor(page.pageGeometry),page.parent);var textWidth=parent.textArea.width;var origin=originTop(flow);for(var i=0;i<flow.children.length;i++){var child=flow.children[i];var block=blockExtent(child,origin);if(block.bottom<=win.start||block.top>=win.end)continue;tiles=Math.max(tiles,inlineTileCount(child.getBoundingClientRect().width,textWidth));}}return tiles;};
var tileInlinePlan=function(plan){if(!config.inlineOverflow)return plan;var pages=[];for(var i=0;i<plan.pages.length;i++){var page=plan.pages[i];var count=inlineTilesForPage(page);for(var tile=0;tile<count;tile++)pages.push(Object.assign({},page,{inlineTile:tile}));}return Object.assign({},plan,{pages:pages});};
var applyPrintedRules=function(plan){if(!config.parentRules)return plan;var rules={};var flows=document.querySelectorAll('[data-segnavia-flow]');for(var i=0;i<flows.length;i++){var id=flows[i].getAttribute('data-segnavia-flow');var held=parentsOf(flows[i]);if(id&&held)rules[id]=held;}return applyPrintedParentRules(plan,rules,config.parentRules,config.direction,pageFace,selectParent);};
var nextLayoutFrame=function(){return new Promise(function(resolve){var settled=false;var done=function(){if(settled)return;settled=true;resolve();};if(window.requestAnimationFrame)window.requestAnimationFrame(done);setTimeout(done,16);});};
var publishPlan=function(plan){var previous=document.querySelectorAll('script[data-segnavia-plan]');for(var i=0;i<previous.length;i++)previous[i].remove();var carrier=document.createElement('script');carrier.type='application/json';carrier.setAttribute('data-segnavia-plan','');carrier.textContent=JSON.stringify(plan).replace(/</g,'\\u003c');document.body.append(carrier);};
var loaded=document.readyState==='complete'?Promise.resolve():new Promise(function(resolve){window.addEventListener('load',resolve,{once:true});});
var loadedFontFailures=[];var fontLoads=loaded.then(function(){var declarations=config.fontLoads||[];return ${declaredFontLoadExpression('declarations')};}).then(function(failures){loadedFontFailures=failures||[];return failures;});
var fontsReady=fontLoads.then(function(){return document.fonts?document.fonts.ready:undefined;});
Promise.all([loaded,${DIAGRAM_READY_EXPR},fontsReady,readyImages(document)]).then(function(){
var visibleElapsed=0;
var visibleStartedAt=performance.now();
var settleVisibleElapsed=0;
var settleStartedAt;
var settlePrevious=[];
var layoutFontsReady=false;
var measurementContinuation=function(input,plannedPages){var flowMeasurements=measurementFlows(input);var measurement=decideBookMeasurement({hasLayout:true,flows:flowMeasurements,plannedPages:plannedPages,visibleElapsedMs:visibleElapsed},Infinity);var measurementNow=performance.now();var measured=decideVisibleMeasurement({visibleElapsedMs:visibleElapsed,frameElapsedMs:measurementNow-visibleStartedAt,hasLayout:true,measured:measurement==='compose'},${BOOK_MEASUREMENT_WAIT_MS});visibleElapsed=measured.visibleElapsedMs;visibleStartedAt=measurementNow;if(measured.decision==='retry')return nextLayoutFrame().then(composeWhenMeasurable);if(measured.decision==='refuse'){fail(measurementRefusal(config.refusalSubject,unmeasuredFlows(flowMeasurements)));return true;}return false;};
var composeWhenMeasurable=async function(){
try{
sizeGalleys();
var settleFlows=document.querySelectorAll('[data-segnavia-flow]:not([data-segnavia-kind="fixed"]):not([data-segnavia-kind="templated"])');var hasLayout=settleFlows.length===0||composerLayoutReady(settleFlows[0]);var visibleNow=performance.now();var visibility=decideVisibleMeasurement({visibleElapsedMs:visibleElapsed,frameElapsedMs:visibleNow-visibleStartedAt,hasLayout:hasLayout,measured:true},${BOOK_MEASUREMENT_WAIT_MS});visibleElapsed=visibility.visibleElapsedMs;visibleStartedAt=visibleNow;if(settleStartedAt===undefined){if(hasLayout)settleStartedAt=visibleNow;}else{settleVisibleElapsed=advanceVisibleTime({visibleElapsedMs:settleVisibleElapsed,frameElapsedMs:visibleNow-settleStartedAt,hasLayout:hasLayout});settleStartedAt=visibleNow;}if(!hasLayout)return nextLayoutFrame().then(composeWhenMeasurable);if(!layoutFontsReady)return (document.fonts?document.fonts.ready:Promise.resolve()).then(function(){layoutFontsReady=true;return composeWhenMeasurable();});var settled=true;for(var settleIndex=0;settleIndex<settleFlows.length;settleIndex++){var settleFlow=settleFlows[settleIndex];var settleSample={inlineSize:settleFlow.getBoundingClientRect().width,scrollWidth:settleFlow.scrollWidth};var previousSettleSample=settlePrevious[settleIndex];var settleDecision=decideLayoutSettle(settleSample,previousSettleSample,{textWidth:parseFloat(settleFlow.style.inlineSize)},settleVisibleElapsed,${LAYOUT_SETTLE_MS});settlePrevious[settleIndex]=settleSample;if(settleDecision==='refuse'){fail('the measure box did not hold the configured text width with a stable scroll width within ${LAYOUT_SETTLE_MS} ms; remove author CSS that changes the composer measure box size, such as padding, border, transform or inline-size on every element, or let content whose layout keeps changing settle, to clear this refusal');return;}if(settleDecision!=='settled')settled=false;}if(!settled)return nextLayoutFrame().then(composeWhenMeasurable);
var planBookOrFail=function(input){var held=planBook(input,config.numbering);if(!held.ok){fail(held.refusals[0].message);return null;}return applyPrintedRules(held.plan);};
var planConverged=function(){var held=planBookOrFail(input);if(!held)return null;planFolios=held;var moved=[];var convergence=convergeLayout(held,function(previous){fillPageReferences(previous.pages);input=measureInput();var next=planBookOrFail(input);if(!next)return null;planFolios=next;moved=unsettledPageReferences(next.pages);return {plan:next,settled:moved.length===0};},3);if(!convergence)return null;if(!convergence.converged){fail('page references to '+moved.join(', ')+' would not settle after three additional compositions; shorten the content or reserve fixed space for page references to clear this refusal');return null;}return convergence.plan;};
fitResults=fitSourceElements();
var input=measureInput();
var plan;
var saved;
if(config.plan){planFolios=config.plan;fillPageReferences(config.plan.pages);input=measureInput();var replayContinuation=measurementContinuation(input,config.plan.pages.length);if(replayContinuation)return replayContinuation===true?undefined:replayContinuation;var replayed=replayPlan(input,config.plan,config.numbering);if(!replayed.ok){fail(replayed.refusal);return;}plan=replayed.plan;planFolios=plan;}
else{plan=planConverged();if(!plan)return;var saveContinuation=measurementContinuation(input,plan.pages.length);if(saveContinuation)return saveContinuation===true?undefined:saveContinuation;}
var setComposedHeight=function(pages){var height=0;for(var i=0;i<pages.length;i++)height+=geometryFor(pages[i].pageGeometry).paperHeight;var value=height+'px';document.documentElement.style.blockSize=value;document.body.style.blockSize=value;};
var preparePlan=function(source){var prepared=applyPrintedRules(tileInlinePlan(source));planFolios=prepared;if(prepared.pages.length>config.limit){fail(config.limitRefusal.template.split(config.limitRefusal.placeholder).join(String(prepared.pages.length)));if(config.measure){setComposedHeight(prepared.pages);document.documentElement.setAttribute('${COMPOSED_ATTRIBUTE}','');}return null;}if(config.expectedCount!==null&&config.expectedCount!==undefined&&prepared.pages.length!==config.expectedCount){fail('the composed page count changed from '+config.expectedCount+' to '+prepared.pages.length+' between measurement and paper composition; wait for the page layout to settle or shorten the content to clear this refusal');return null;}return prepared;};
var prepared=preparePlan(plan);if(!prepared)return;
if(config.measure){setComposedHeight(prepared.pages);document.documentElement.setAttribute('${COMPOSED_MS_ATTRIBUTE}',String(Math.round(performance.now()-composeStarted)));document.documentElement.setAttribute('${COMPOSED_ATTRIBUTE}','');return;}
var composed=await compose(prepared,input.geometry.noteSeries||[]);
if(document.documentElement.hasAttribute('${COMPOSE_FAILURE_ATTRIBUTE}'))return;
var settlement=settleHeldNoteViews();
if(settlement==='failed')return;
if(settlement==='overlap'&&!config.plan){input=measureInput();var repaired=planConverged();if(!repaired)return;composed.remove();input=measureInput();plan=repaired;prepared=preparePlan(plan);if(!prepared)return;composed=await compose(prepared,input.geometry.noteSeries||[]);if(document.documentElement.hasAttribute('${COMPOSE_FAILURE_ATTRIBUTE}'))return;settlement=settleHeldNoteViews();}
if(settlement==='failed')return;
if(settlement==='overlap'){fail('settled page note lines move the note stack into the planned body; shorten the page notes or body so their settled line boxes do not overlap');return;}
if(config.savedPlans&&!config.plan)saved=savePlan(input,plan,config.numbering);
if(saved)publishPlan(saved);
return Promise.all([document.fonts?document.fonts.ready:Promise.resolve(),readyImages(composed)]).then(function(){var finalSettlement=settleHeldNoteViews();if(finalSettlement==='failed')return;if(finalSettlement==='overlap'){fail('settled page note lines move the note stack into the planned body; shorten the page notes or body so their settled line boxes do not overlap');return;}presentScreen(composed,prepared.pages.length);completePreflight(prepared,input.flows,function(){document.documentElement.setAttribute('${COMPOSED_MS_ATTRIBUTE}',String(Math.round(performance.now()-composeStarted)));document.documentElement.setAttribute('${COMPOSED_ATTRIBUTE}','');});});
}catch(error){fail(error instanceof Error?error.message:String(error));}
};
return composeWhenMeasurable();
}).catch(function(error){fail(error instanceof Error?error.message:String(error));});
}catch(error){fail(error instanceof Error?error.message:String(error));}
})();`
  return script
}

export const COMPOSER_SCRIPT = composerScript('{}')
