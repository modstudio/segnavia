import {
  boundPreflightReport,
  PREFLIGHT_BLOCK_LIMIT,
  PREFLIGHT_CHECKS,
  PREFLIGHT_FIT_GROUP_LIMIT,
  PREFLIGHT_FIT_SIZE_LIMIT,
  PREFLIGHT_FITS_LIMIT,
  PREFLIGHT_FOLIO_LIMIT,
  PREFLIGHT_ISSUES_PER_CHECK,
  PREFLIGHT_MESSAGE_LIMIT,
  PREFLIGHT_PAGES_LIMIT,
  PREFLIGHT_SUBJECT_LIMIT,
  preflightRefusal,
} from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import { pageBlockRange } from '@segnavia/layout'
import { MESSAGE } from './bridge.ts'
import { preflightPageFacts } from './composer-dress.ts'

export const PREFLIGHT_ATTRIBUTE = 'data-segnavia-preflight'

export function embeddedPreflightFunctions(): string {
  return `var PREFLIGHT_CHECKS=${JSON.stringify(PREFLIGHT_CHECKS)},PREFLIGHT_ISSUES_PER_CHECK=${PREFLIGHT_ISSUES_PER_CHECK},PREFLIGHT_SUBJECT_LIMIT=${PREFLIGHT_SUBJECT_LIMIT},PREFLIGHT_MESSAGE_LIMIT=${PREFLIGHT_MESSAGE_LIMIT},PREFLIGHT_FOLIO_LIMIT=${PREFLIGHT_FOLIO_LIMIT},PREFLIGHT_BLOCK_LIMIT=${PREFLIGHT_BLOCK_LIMIT},PREFLIGHT_PAGES_LIMIT=${PREFLIGHT_PAGES_LIMIT},PREFLIGHT_FITS_LIMIT=${PREFLIGHT_FITS_LIMIT},PREFLIGHT_FIT_GROUP_LIMIT=${PREFLIGHT_FIT_GROUP_LIMIT},PREFLIGHT_FIT_SIZE_LIMIT=${PREFLIGHT_FIT_SIZE_LIMIT};
${embedFunction('boundPreflightReportImplementation', boundPreflightReport)}
var boundPreflightReport=function(input,profile){return boundPreflightReportImplementation(input,profile,{checks:PREFLIGHT_CHECKS,issuesPerCheck:PREFLIGHT_ISSUES_PER_CHECK,subject:PREFLIGHT_SUBJECT_LIMIT,message:PREFLIGHT_MESSAGE_LIMIT,folio:PREFLIGHT_FOLIO_LIMIT,block:PREFLIGHT_BLOCK_LIMIT,pages:PREFLIGHT_PAGES_LIMIT,fits:PREFLIGHT_FITS_LIMIT,fitGroup:PREFLIGHT_FIT_GROUP_LIMIT,fitSize:PREFLIGHT_FIT_SIZE_LIMIT});};
${embedFunction('preflightRefusal', preflightRefusal)}
${embedFunction('pageBlockRange', pageBlockRange)}
${embedFunction('preflightPageFacts', preflightPageFacts)}
var publishPreflight=function(plan){if(!config.preflight)return true;var pageFacts=preflightPageFacts(plan.pages,planFolios.folios,input.flows);var report=boundPreflightReport({entries:preflightEntries,facts:{pageCount:plan.pages.length,pages:pageFacts,fits:preflightFits}},config.preflight);var json=JSON.stringify(report);document.documentElement.setAttribute('${PREFLIGHT_ATTRIBUTE}',json);window.parent.postMessage({type:'${MESSAGE.preflight}',report:report},'*');var refusal=preflightRefusal(report);if(refusal){fail(refusal);return false;}return true;};`
}
