import { firstStrongDirection, textDirection } from '@segnavia/format'
import mermaidBundle from 'mermaid/dist/mermaid.min.js' with { type: 'text' }
import { DIAGRAM_ERROR_ATTRIBUTE, DIAGRAM_FAILED_ATTRIBUTE, DIAGRAM_ID_PREFIX, DIAGRAM_READY_NAME, DIAGRAM_SELECTOR } from './diagram-document.ts'

export { hasDiagram, withDiagramScript } from './diagram-document.ts'

export function diagramErrorFirstLine(error: unknown): string {
  const message = error && typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : String(error)
  return message.split(/\r?\n/, 1)[0] || 'Diagram could not be drawn.'
}

export function diagramLabelDirection(text: string): 'ltr' | 'rtl' {
  return firstStrongDirection(text) ?? 'ltr'
}

const runtime = `;(function(){
var root=document.documentElement;
${textDirection.toString()}
${firstStrongDirection.toString()}
${diagramErrorFirstLine.toString()}
${diagramLabelDirection.toString()}
var fail=function(element,error){element.setAttribute(${JSON.stringify(DIAGRAM_FAILED_ATTRIBUTE)},'');var message=document.createElement('samp');message.setAttribute(${JSON.stringify(DIAGRAM_ERROR_ATTRIBUTE)},'');message.textContent=diagramErrorFirstLine(error);element.append(message);};
window[${JSON.stringify(DIAGRAM_READY_NAME)}]=(async function(){
mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false});
var nodes=Array.prototype.slice.call(document.querySelectorAll(${JSON.stringify(DIAGRAM_SELECTOR)}));
for(var index=0;index<nodes.length;index++){
var element=nodes[index];var source=element.querySelector('code');var text=source?source.textContent:element.textContent;
try{var id=${JSON.stringify(DIAGRAM_ID_PREFIX)}+index;var drawn=await mermaid.render(id,text||'');element.innerHTML=drawn.svg;var labels=element.querySelectorAll('text');for(var labelIndex=0;labelIndex<labels.length;labelIndex++){var label=labels[labelIndex];label.setAttribute('direction',diagramLabelDirection(label.textContent||''));label.style.unicodeBidi='plaintext';}if(drawn.bindFunctions)drawn.bindFunctions(element);}catch(error){var artifact=document.getElementById(${JSON.stringify(DIAGRAM_ID_PREFIX)}+index);if(artifact&&artifact.parentElement&&!artifact.closest(${JSON.stringify(DIAGRAM_SELECTOR)}))artifact.parentElement.remove();fail(element,error);}
}
root.setAttribute('data-segnavia-diagrams-drawn','');
})().catch(function(){root.setAttribute('data-segnavia-diagrams-drawn','');});
})();`

/** The complete offline Mermaid renderer and Segnavia's per-diagram drawing adapter. */
export const diagramScript: string = `${mermaidBundle.replace(/<\/script/gi, '<\\/script')}${runtime}`
