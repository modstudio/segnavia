import {
  boundPreflightReport,
  cssVarInvalidMessage,
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
  type PreflightEntry,
  preflightRefusal,
} from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import { pageBlockRange } from '@segnavia/layout'
import { MESSAGE } from './bridge.ts'
import { preflightPageFacts } from './composer-dress.ts'
import { fontMissingEntries } from './font-load.ts'

export const PREFLIGHT_ATTRIBUTE = 'data-segnavia-preflight'

export function appendSlotOversetEntries(slots: Record<string, string>, entries: PreflightEntry[]): void {
  for (const [key, state] of Object.entries(slots)) {
    if (state !== 'overflowed' || entries.some((entry) => entry.check === 'slot-overset' && entry.subject === key)) continue
    entries.push({ check: 'slot-overset', subject: key, message: `Slot ${key} is overset; shorten its value or enlarge the slot to clear it.` })
  }
}

function inlineVarHasFallback(style: string, start: number): boolean {
  let depth = 1
  for (let at = start; at < style.length && depth > 0; at++) {
    const character = style[at]
    if (character === '(') depth++
    else if (character === ')') depth--
    else if (character === ',' && depth === 1) return true
  }
  return false
}

function inlineVariablesWithoutFallback(style: string): string[] {
  const found: string[] = []
  for (const match of style.matchAll(/var\(\s*(--[\w-]+)/gi)) {
    const subject = match[1]
    if (subject && !inlineVarHasFallback(style, (match.index ?? 0) + match[0].length)) found.push(subject)
  }
  return found
}

export function markFurnitureInvalidVariables(root: Element, entries: PreflightEntry[], computed: typeof getComputedStyle): void {
  const elements = root.querySelectorAll('[data-segnavia-head] [style],[data-segnavia-foot] [style]')
  for (const element of elements) {
    for (const subject of inlineVariablesWithoutFallback(element.getAttribute('style') ?? '')) {
      if (computed(element).getPropertyValue(subject).trim() !== '') continue
      if (entries.some((entry) => entry.check === 'css-var-invalid' && entry.subject === subject)) continue
      entries.push({ check: 'css-var-invalid', subject, message: cssVarInvalidMessage(subject) })
    }
  }
}

export function embeddedPreflightFunctions(): string {
  return `var PREFLIGHT_CHECKS=${JSON.stringify(PREFLIGHT_CHECKS)},PREFLIGHT_ISSUES_PER_CHECK=${PREFLIGHT_ISSUES_PER_CHECK},PREFLIGHT_SUBJECT_LIMIT=${PREFLIGHT_SUBJECT_LIMIT},PREFLIGHT_MESSAGE_LIMIT=${PREFLIGHT_MESSAGE_LIMIT},PREFLIGHT_FOLIO_LIMIT=${PREFLIGHT_FOLIO_LIMIT},PREFLIGHT_BLOCK_LIMIT=${PREFLIGHT_BLOCK_LIMIT},PREFLIGHT_PAGES_LIMIT=${PREFLIGHT_PAGES_LIMIT},PREFLIGHT_FITS_LIMIT=${PREFLIGHT_FITS_LIMIT},PREFLIGHT_FIT_GROUP_LIMIT=${PREFLIGHT_FIT_GROUP_LIMIT},PREFLIGHT_FIT_SIZE_LIMIT=${PREFLIGHT_FIT_SIZE_LIMIT};
${embedFunction('boundPreflightReportImplementation', boundPreflightReport)}
var boundPreflightReport=function(input,profile){return boundPreflightReportImplementation(input,profile,{checks:PREFLIGHT_CHECKS,issuesPerCheck:PREFLIGHT_ISSUES_PER_CHECK,subject:PREFLIGHT_SUBJECT_LIMIT,message:PREFLIGHT_MESSAGE_LIMIT,folio:PREFLIGHT_FOLIO_LIMIT,block:PREFLIGHT_BLOCK_LIMIT,pages:PREFLIGHT_PAGES_LIMIT,fits:PREFLIGHT_FITS_LIMIT,fitGroup:PREFLIGHT_FIT_GROUP_LIMIT,fitSize:PREFLIGHT_FIT_SIZE_LIMIT});};
${embedFunction('preflightRefusal', preflightRefusal)}
${embedFunction('cssVarInvalidMessage', cssVarInvalidMessage)}
${embedFunction('pageBlockRange', pageBlockRange)}
${embedFunction('preflightPageFacts', preflightPageFacts)}
${embedFunction('appendSlotOversetEntries', appendSlotOversetEntries)}
${embedFunction('inlineVarHasFallback', inlineVarHasFallback)}
${embedFunction('inlineVariablesWithoutFallback', inlineVariablesWithoutFallback)}
${embedFunction('markFurnitureInvalidVariables', markFurnitureInvalidVariables)}
${embedFunction('fontMissingEntries', fontMissingEntries)}
var publishPreflight=function(plan,flows){if(!config.preflight)return true;var pageFacts=preflightPageFacts(plan.pages,planFolios.folios,flows);var report=boundPreflightReport({entries:preflightEntries,facts:{pageCount:plan.pages.length,pages:pageFacts,fits:preflightFits}},config.preflight);var json=JSON.stringify(report);document.documentElement.setAttribute('${PREFLIGHT_ATTRIBUTE}',json);window.parent.postMessage({type:'${MESSAGE.preflight}',report:report},'*');var refusal=preflightRefusal(report);if(refusal){fail(refusal);return false;}return true;};
var completePreflight=function(plan,flows,done){var publish=function(){if(publishPreflight(plan,flows))done();};if(config.preflight&&config.preflight['slot-overset']!=='off'&&typeof window.segnaviaSlotFit==='function'){window.segnaviaSlotFit(function(slots){appendSlotOversetEntries(slots||{},preflightEntries);publish();});return;}publish();};`
}
