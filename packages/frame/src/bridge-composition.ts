export interface CompositionWaitOptions {
  readyAfterAttribute?: string
  failureAttribute?: string
  progressAttribute?: string
  progressCallback?: string
  reportHeight?: boolean
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function compositionWait(options: CompositionWaitOptions, messages: { composeFailure: string; composeProgress: string }, failureLimit: number): string {
  if (!options.readyAfterAttribute) return 'null'
  const report = options.reportHeight === false ? '' : 'report();'
  const progressCallback = options.progressCallback ? `window[${scriptJson(options.progressCallback)}]({pages:pages,total:total});` : ''
  const progress = options.progressAttribute
    ? `var progressName=${scriptJson(options.progressAttribute)};var progress=function(){var parts=(root.getAttribute(progressName)||'').split('/');var pages=Number(parts[0]),total=Number(parts[1]);if(parts.length!==2||!Number.isInteger(pages)||!Number.isInteger(total)||pages<0||total<0||pages>10000||total>10000||pages>total)return;post({type:'${messages.composeProgress}',pages:pages,total:total});${progressCallback}};progress();`
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
