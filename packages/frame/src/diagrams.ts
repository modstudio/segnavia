import mermaidBundle from 'mermaid/dist/mermaid.min.js' with { type: 'text' }

export { hasDiagram, withDiagramScript } from './diagram-document.ts'

const runtime = String.raw`;(function(){
var root=document.documentElement;
var firstLine=function(error){var message=error&&typeof error.message==='string'?error.message:String(error);return message.split(/\r?\n/,1)[0]||'Diagram could not be drawn.';};
var direction=function(text){return /^[^A-Za-z\u0590-\u08ff]*[\u0590-\u08ff]/.test(text)?'rtl':'ltr';};
var fail=function(element,error){element.setAttribute('data-segnavia-diagram-failed','');var message=document.createElement('samp');message.setAttribute('data-segnavia-diagram-error','');message.textContent=firstLine(error);element.append(message);};
window.__segnaviaDiagramReady=(async function(){
mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false});
var nodes=Array.prototype.slice.call(document.querySelectorAll('[data-segnavia-diagram="mermaid"]'));
for(var index=0;index<nodes.length;index++){
var element=nodes[index];var source=element.querySelector('code');var text=source?source.textContent:element.textContent;
try{var id='segnavia-diagram-'+index;var drawn=await mermaid.render(id,text||'');element.innerHTML=drawn.svg;var labels=element.querySelectorAll('text');for(var labelIndex=0;labelIndex<labels.length;labelIndex++){var label=labels[labelIndex];label.setAttribute('direction',direction(label.textContent||''));label.style.unicodeBidi='plaintext';}if(drawn.bindFunctions)drawn.bindFunctions(element);}catch(error){var artifact=document.getElementById('segnavia-diagram-'+index);if(artifact&&artifact.parentElement&&!artifact.closest('[data-segnavia-diagram]'))artifact.parentElement.remove();fail(element,error);}
}
root.setAttribute('data-segnavia-diagrams-drawn','');
})().catch(function(){root.setAttribute('data-segnavia-diagrams-drawn','');});
})();`

/** The complete offline Mermaid renderer and Segnavia's per-diagram drawing adapter. */
export const diagramScript: string = `${mermaidBundle.replace(/<\/script/gi, '<\\/script')}${runtime}`
