import { firstStrongDirection, textDirection } from '@segnavia/format'
import {
  DIAGRAM_ERROR_ATTRIBUTE,
  DIAGRAM_FAILED_ATTRIBUTE,
  DIAGRAM_ID_PREFIX,
  DIAGRAM_SELECTOR,
} from '@segnavia/frame/diagrams'
import mermaidBundle from 'mermaid/dist/mermaid.min.js' with { type: 'text' }
import { diagramErrorFirstLine, diagramFailureIssue, diagramLabelDirection } from './runtime.ts'

const runtime = `;(function(){
${textDirection.toString()}
${firstStrongDirection.toString()}
${diagramErrorFirstLine.toString()}
${diagramFailureIssue.toString()}
${diagramLabelDirection.toString()}
var fail=function(element,error,report){element.setAttribute(${JSON.stringify(DIAGRAM_FAILED_ATTRIBUTE)},'');var issue=diagramFailureIssue(element.id,error);var message=document.createElement('samp');message.setAttribute(${JSON.stringify(DIAGRAM_ERROR_ATTRIBUTE)},'');message.textContent=issue.message;element.append(message);report(issue);};
window.segnaviaLayout.define({galley:async function(context){
mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false});
var nodes=Array.prototype.slice.call(context.elements);
for(var index=0;index<nodes.length;index++){
var element=nodes[index];var source=element.querySelector('code');var text=source?source.textContent:element.textContent;
try{var id=${JSON.stringify(DIAGRAM_ID_PREFIX)}+index;var drawn=await mermaid.render(id,text||'');element.innerHTML=drawn.svg;var labels=element.querySelectorAll('text');for(var labelIndex=0;labelIndex<labels.length;labelIndex++){var label=labels[labelIndex];label.setAttribute('direction',diagramLabelDirection(label.textContent||''));label.style.unicodeBidi='plaintext';}if(drawn.bindFunctions)drawn.bindFunctions(element);}catch(error){var artifact=document.getElementById(${JSON.stringify(DIAGRAM_ID_PREFIX)}+index);if(artifact&&artifact.parentElement&&!artifact.closest(${JSON.stringify(DIAGRAM_SELECTOR)}))artifact.parentElement.remove();fail(element,error,context.report);}
}
}});
})();`

/** The complete offline Mermaid renderer and Segnavia's per-diagram drawing adapter. */
export const diagramProviderScript: string = `${mermaidBundle.replace(/<\/script/gi, '<\\/script')}${runtime}`
