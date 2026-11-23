import { MESSAGE } from './frame-message-types.ts'

export function cueBridgeScript(): string {
  return `var cueApplied=false,lastCue=null;
var showCue=function(annotations){cueApplied=true;lastCue=annotations;var root=document.documentElement;root.setAttribute('data-segnavia-cues','');var marked=document.querySelectorAll('[data-annotation]');for(var c=0;c<marked.length;c++){var index=Number(marked[c].getAttribute('data-annotation'));marked[c].toggleAttribute('data-shown',annotations===null||annotations.indexOf(index)!==-1);}};
var cueAnnotations=function(value){if(value===null)return null;if(!Array.isArray(value)||value.length>256)return false;for(var c=0;c<value.length;c++){var index=value[c];if(typeof index!=='number'||!isFinite(index)||Math.floor(index)!==index||index<0||index>255||(c>0&&value[c-1]>=index))return false;}return value;};`
}

export function cueMessageBranch(): string {
  return `else if(data.type==='${MESSAGE.cue}'){var annotations=cueAnnotations(data.annotations);if(annotations!==false)showCue(annotations);}`
}
