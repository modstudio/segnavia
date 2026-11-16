import {
  appendSlotOversetEntries,
  cssVarInvalidMessage,
  fontMissingEntries,
  isMeasuredSlotFit,
  type PlanPage,
  type PreflightEntry,
  preflightRefusal,
  slotFitCoverage,
  unmeasuredSlotsRefusalMessage,
} from '@segnavia/format'
import { embedFunction, fittedSlotModes, readSlotOverflowMarker } from '@segnavia/html'
import { pageBlockRange, pageIndexForTarget } from '@segnavia/layout'
import { MESSAGE } from './bridge.ts'
import { preflightPageFacts } from './composer-dress.ts'
import { type ComposedHjViolation, hjViolationEntry } from './composer-hj-violations.ts'
import { blockSubject } from './composer-source-staging.ts'
import { embeddedPreflightBounds, PREFLIGHT_ATTRIBUTE, publishPreflightReport, slotMarkCoverage } from './embedded-preflight.ts'

export { PREFLIGHT_ATTRIBUTE } from './embedded-preflight.ts'

type HjPlanPage = Pick<PlanPage, 'blank' | 'flow' | 'role' | 'sectionOpening' | 'windows' | 'notes'>

interface HjLineBox {
  top: number
  bottom: number
}

type HjLinesFor = (element: Element, origin: number) => readonly HjLineBox[]

export function hjViolationSubject(paragraph: Element, fallbackIndex: number): string {
  const identified = blockSubject(paragraph as HTMLElement)
  if (identified) return identified
  const note = paragraph.closest('[data-segnavia-note]')
  if (note) {
    const id = note.getAttribute('data-segnavia-note') ?? ''
    const index = Array.prototype.indexOf.call(note.querySelectorAll('p'), paragraph) + 1
    return `note ${id} p ${index > 0 ? index : fallbackIndex}`
  }
  const flow = paragraph.closest('[data-segnavia-flow]')
  if (flow) {
    let block = paragraph
    while (block.parentElement && block.parentElement !== flow) block = block.parentElement
    const blockIndex = Array.prototype.indexOf.call(flow.children, block) + 1
    if (blockIndex > 0 && block === paragraph) return `${flow.getAttribute('data-segnavia-flow') ?? ''} p block ${blockIndex}`
    if (blockIndex <= 0) return `${flow.getAttribute('data-segnavia-flow') ?? 'flow'} paragraph ${fallbackIndex}`
    const paragraphIndex = Array.prototype.indexOf.call(block.querySelectorAll('p'), paragraph) + 1
    return `${flow.getAttribute('data-segnavia-flow') ?? ''} p block ${blockIndex} paragraph ${paragraphIndex > 0 ? paragraphIndex : fallbackIndex}`
  }
  return `paragraph ${fallbackIndex}`
}

export function hjViolationFolio(
  paragraph: Element,
  lineIndex: number,
  pages: HjPlanPage[],
  folios: readonly (string | null)[],
  linesFor: HjLinesFor,
): string | undefined {
  const flow = paragraph.closest('[data-segnavia-flow]')
  const line = paragraph.querySelectorAll(':scope > [data-segnavia-line]')[lineIndex]
  if (!line) return undefined
  let page: number | undefined
  if (flow) {
    const flowId = flow.getAttribute('data-segnavia-flow') ?? ''
    const holder = paragraph.closest('[data-segnavia-designed-page],[data-segnavia-templated-page]')
    const heldPage = holder ? Number(holder.getAttribute('data-segnavia-designed-page') ?? holder.getAttribute('data-segnavia-templated-page')) : undefined
    page = pageIndexForTarget(pages, {
      flow: flowId,
      ...(heldPage ? { heldPage } : { top: line.getBoundingClientRect().top - flow.getBoundingClientRect().top }),
    })
  } else {
    const note = paragraph.closest('[data-segnavia-note]')
    const noteId = note?.getAttribute('data-segnavia-note')
    if (note && noteId) {
      const origin = note.getBoundingClientRect().top
      const box = line.getBoundingClientRect()
      const noteLine = linesFor(note, origin).findIndex(({ top, bottom }) => box.bottom - origin > top && box.top - origin < bottom)
      if (noteLine >= 0) page = pages.findIndex(({ notes }) => notes.some(({ id, start, end }) => id === noteId && noteLine >= start && noteLine < end))
    }
  }
  return page === undefined || page < 0 ? undefined : (folios[page] ?? undefined)
}

export function appendHjViolationEntries(
  composedHjViolations: ReadonlyMap<Element, ComposedHjViolation>,
  pages: HjPlanPage[],
  folios: readonly (string | null)[],
  entries: PreflightEntry[],
  linesFor: HjLinesFor,
): void {
  let fallbackIndex = 0
  const subjects = new Set<string>()
  for (const [paragraph, composed] of composedHjViolations) {
    fallbackIndex += 1
    const base = hjViolationSubject(paragraph, fallbackIndex)
    let subject = base
    let duplicate = 2
    while (subjects.has(subject)) subject = `${base} paragraph ${duplicate++}`
    subjects.add(subject)
    entries.push(hjViolationEntry(subject, hjViolationFolio(paragraph, composed.violation.line, pages, folios, linesFor), composed.violation, composed.spacing))
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
${embedFunction('hjViolationSubject', hjViolationSubject)}
${embedFunction('hjViolationFolio', hjViolationFolio)}
${embedFunction('appendHjViolationEntries', appendHjViolationEntries)}
${embedFunction('unmeasuredSlotsRefusalMessage', unmeasuredSlotsRefusalMessage)}
${embedFunction('appendSlotOversetEntries', appendSlotOversetEntries)}
${embedFunction('inlineVarHasFallback', inlineVarHasFallback)}
${embedFunction('inlineVariablesWithoutFallback', inlineVariablesWithoutFallback)}
${embedFunction('markFurnitureInvalidVariables', markFurnitureInvalidVariables)}
${embedFunction('fontMissingEntries', fontMissingEntries)}
${embedFunction('publishPreflightReport', publishPreflightReport)}
${embedFunction('isMeasuredSlotFit', isMeasuredSlotFit)}
${embedFunction('slotFitCoverage', slotFitCoverage)}
${embedFunction('fittedSlotModes', fittedSlotModes)}
${embedFunction('readSlotOverflowMarker', readSlotOverflowMarker)}
${embedFunction('slotMarkCoverage', slotMarkCoverage)}
var publishPreflight=function(plan,flows,regionFacts,slotCoverage){if(!config.preflight)return true;var mergedRegionFacts=[];for(var regionFactIndex=0;regionFactIndex<regionFacts.length;regionFactIndex++)mergeRegionFact(mergedRegionFacts,regionFacts[regionFactIndex]);var pageFacts=preflightPageFacts(plan.pages,planFolios.folios,flows);var report=boundPreflightReport({entries:preflightEntries,facts:{pageCount:plan.pages.length,pages:pageFacts,fits:preflightFits,regions:mergedRegionFacts},coverage:{measured:plan.pages.length,total:plan.pages.length,slots:slotCoverage||{measured:0,total:0}}},config.preflight);publishPreflightReport(report,'${PREFLIGHT_ATTRIBUTE}','${MESSAGE.preflight}',function(message){window.parent.postMessage(message,'*');});var refusal=preflightRefusal(report);if(refusal){fail(refusal);return false;}return true;};
var completePreflight=function(plan,flows,done){var publish=function(slotCoverage){if(publishPreflight(plan,flows,preflightRegions,slotCoverage))done();};if(config.preflight&&(config.preflight['slot-overset']!=='off'||config.preflight['coverage-incomplete']!=='off')&&typeof window.segnaviaSlotFit==='function'){window.segnaviaSlotFit(function(slots){slots=slots||{};var slotMarks=slotMarkCoverage(slots,document.querySelectorAll('[data-slot-overflow]'));if(config.preflight['slot-overset']!=='off')appendSlotOversetEntries(slots,preflightEntries,{refuseKeys:slotMarks.refuseKeys});publish(slotMarks.coverage);});return;}publish();};`
}
