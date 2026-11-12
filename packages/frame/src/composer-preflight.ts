import { appendSlotOversetEntries, cssVarInvalidMessage, fontMissingEntries, type PreflightEntry, preflightRefusal } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import { pageBlockRange } from '@segnavia/layout'
import { MESSAGE } from './bridge.ts'
import { preflightPageFacts } from './composer-dress.ts'
import { embeddedPreflightBounds, PREFLIGHT_ATTRIBUTE, publishPreflightReport } from './embedded-preflight.ts'

export { PREFLIGHT_ATTRIBUTE } from './embedded-preflight.ts'

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
  const elements = root.querySelectorAll('[data-segnavia-region] [style]')
  for (const element of elements) {
    for (const subject of inlineVariablesWithoutFallback(element.getAttribute('style') ?? '')) {
      if (computed(element).getPropertyValue(subject).trim() !== '') continue
      if (entries.some((entry) => entry.check === 'css-var-invalid' && entry.subject === subject)) continue
      entries.push({ check: 'css-var-invalid', subject, message: cssVarInvalidMessage(subject) })
    }
  }
}

export function embeddedPreflightFunctions(): string {
  return `${embeddedPreflightBounds()}
${embedFunction('preflightRefusal', preflightRefusal)}
${embedFunction('cssVarInvalidMessage', cssVarInvalidMessage)}
${embedFunction('pageBlockRange', pageBlockRange)}
${embedFunction('preflightPageFacts', preflightPageFacts)}
${embedFunction('appendSlotOversetEntries', appendSlotOversetEntries)}
${embedFunction('inlineVarHasFallback', inlineVarHasFallback)}
${embedFunction('inlineVariablesWithoutFallback', inlineVariablesWithoutFallback)}
${embedFunction('markFurnitureInvalidVariables', markFurnitureInvalidVariables)}
${embedFunction('fontMissingEntries', fontMissingEntries)}
${embedFunction('publishPreflightReport', publishPreflightReport)}
var publishPreflight=function(plan,flows){if(!config.preflight)return true;var regionFacts=typeof preflightRegions==='undefined'?[]:preflightRegions;var filledRegions=typeof document.querySelectorAll==='function'?document.querySelectorAll('[data-segnavia-fill-count]'):[];for(var filledRegionIndex=0;filledRegionIndex<filledRegions.length;filledRegionIndex++){var filledRegionFact={subject:regionSubject(filledRegions[filledRegionIndex]),fillCount:Number(filledRegions[filledRegionIndex].getAttribute('data-segnavia-fill-count'))};if(!regionFacts.some(function(fact){return fact.subject===filledRegionFact.subject;}))regionFacts.push(filledRegionFact);}var pageFacts=preflightPageFacts(plan.pages,planFolios.folios,flows);var report=boundPreflightReport({entries:preflightEntries,facts:{pageCount:plan.pages.length,pages:pageFacts,fits:preflightFits,regions:regionFacts}},config.preflight);publishPreflightReport(report,'${PREFLIGHT_ATTRIBUTE}','${MESSAGE.preflight}',function(message){window.parent.postMessage(message,'*');});var refusal=preflightRefusal(report);if(refusal){fail(refusal);return false;}return true;};
var completePreflight=function(plan,flows,done){var publish=function(){if(publishPreflight(plan,flows))done();};if(config.preflight&&config.preflight['slot-overset']!=='off'&&typeof window.segnaviaSlotFit==='function'){window.segnaviaSlotFit(function(slots){appendSlotOversetEntries(slots||{},preflightEntries);publish();});return;}publish();};`
}
