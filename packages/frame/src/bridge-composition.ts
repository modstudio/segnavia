import { boundComposeProgress } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import { type FrameOptions, scriptJson } from './bridge.ts'

export type CompositionWaitOptions = Pick<FrameOptions, 'readyAfterAttribute' | 'failureAttribute' | 'progressAttribute' | 'progressCallback' | 'reportHeight'>

export function compositionWait(
  options: CompositionWaitOptions,
  messages: { composeFailure: string; composeProgress: string },
  failureLimit: number,
  progressLimit: number,
): string {
  if (!options.readyAfterAttribute) return 'null'
  const report = options.reportHeight === false ? '' : 'report();'
  const progressCallback = options.progressCallback
    ? `var callback=window[${scriptJson(options.progressCallback)}];if(typeof callback==='function')callback({pages:pages,total:total});`
    : ''
  const progress = options.progressAttribute
    ? `var COMPOSE_PROGRESS_PAGES_LIMIT=${progressLimit};${embedFunction('boundComposeProgress', boundComposeProgress)}var progressName=${scriptJson(options.progressAttribute)};var postedProgress;var progress=function(){var value=root.getAttribute(progressName)||'';if(value===postedProgress)return;var parts=value.split('/');var bounded=boundComposeProgress({pages:Number(parts[0]),total:Number(parts[1])});if(parts.length!==2||!bounded)return;var pages=bounded.pages,total=bounded.total;post({type:'${messages.composeProgress}',pages:pages,total:total});${progressCallback}postedProgress=value;};progress();`
    : ''
  const failure = options.failureAttribute
    ? `var failureName=${scriptJson(options.failureAttribute)};var settled=false;var failed=function(){if(settled)return true;if(!root.hasAttribute(failureName))return false;settled=true;var text=root.getAttribute(failureName)||'';if(text.length>${failureLimit})text=text.slice(0,${failureLimit - 1})+'…';post({type:'${messages.composeFailure}',text:text});return true;};if(failed())return;`
    : ''
  const settle = options.failureAttribute ? 'settled=true;' : ''
  const fail = options.failureAttribute ? 'if(failed()){observer.disconnect();return;}' : ''
  const failureFilter = options.failureAttribute ? ',failureName' : ''
  const progressFilter = options.progressAttribute ? ',progressName' : ''
  const progressReport = options.progressAttribute ? 'progress();' : ''
  return `new Promise(function(resolve){var root=document.documentElement;var name=${scriptJson(options.readyAfterAttribute)};${progress}${failure}if(root.hasAttribute(name)){${settle}${report}resolve();return;}if(!window.MutationObserver)return;new MutationObserver(function(records,observer){${progressReport}${fail}if(root.hasAttribute(name)){observer.disconnect();${settle}${report}resolve();}}).observe(root,{attributes:true,attributeFilter:[name${failureFilter}${progressFilter}]});})`
}
