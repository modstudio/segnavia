import { defaultParentRules, type PaginateLine, type ParentRules, type TextArea, textHoldingParentRules } from '@segnavia/format'
import { backgroundPaints, decorationEdges, type MeasuredDecorationBox, parseBoxShadows } from './composer-decoration.ts'
import { contentRangesExcludingSideNotes, insideSideNote } from './composer-line-range.ts'
import { linesWithDescendantTables, lineWithinBox, measureTableLines, tableRenderedInFlow } from './composer-table-measure.ts'

export interface MeasuredKeepCandidate {
  top: number
  bottom: number
  avoidInside: boolean
  keepWithNext: boolean
  keepWithPrevious: boolean
}

export interface MeasuredKeeps {
  keepRuns: Array<{ start: number; end: number }>
  keepWithNextFrom?: number
  keepWithPrevious?: boolean
}

export interface MeasuredLineBox {
  top: number
  bottom: number
  counted?: boolean
  decorationTop?: number
  decorationBottom?: number
  headerHeight?: number
}

export function lineNumberedLines(lines: readonly MeasuredLineBox[], element: Element, origin: number): MeasuredLineBox[] {
  const excluded: Array<{ top: number; bottom: number }> = []
  for (const candidate of element.querySelectorAll('h1,h2,h3,h4,h5,h6,table,figure,img')) {
    if (insideSideNote(candidate)) continue
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(candidate)
    const rects = Array.from(range.getClientRects())
    const boxes = rects.length > 0 ? rects : [candidate.getBoundingClientRect()]
    for (const box of boxes) excluded.push({ top: box.top - origin, bottom: box.bottom - origin })
  }
  return lines.map((line) => (excluded.some((box) => lineWithinBox(line, box)) ? { ...line, counted: false } : { ...line }))
}

export interface KeepSignalValues {
  breakInside: string
  pageBreakInside: string
  breakAfter: string
  pageBreakAfter: string
  breakBefore: string
  pageBreakBefore: string
  keepWith: string
}

export interface KeepSignals {
  avoidInside: boolean
  keepWithNext: boolean
  keepWithPrevious: boolean
}

export function keepSignals(values: KeepSignalValues): KeepSignals {
  return {
    avoidInside: values.breakInside === 'avoid' || values.pageBreakInside === 'avoid',
    keepWithNext: values.breakAfter === 'avoid' || values.pageBreakAfter === 'avoid' || values.keepWith === 'next',
    keepWithPrevious: values.breakBefore === 'avoid' || values.pageBreakBefore === 'avoid' || values.keepWith === 'previous',
  }
}

export function outermostKeepValue(value: string, parentValue: string, acceptedValues: readonly string[]): boolean {
  return acceptedValues.includes(value) && value !== parentValue
}

export function descendantKeepSignals(values: KeepSignalValues, parentKeepWith: string): KeepSignals {
  return keepSignals({
    ...values,
    keepWith: outermostKeepValue(values.keepWith, parentKeepWith, ['next', 'previous']) ? values.keepWith : '',
  })
}

export function inlineLevelDisplay(display: string): boolean {
  return display.split(' ')[0]?.startsWith('inline') === true
}

export function skippableDescendantBoxDisplay(display: string): boolean {
  return display === 'none' || display === 'contents' || inlineLevelDisplay(display) || display === 'ruby' || display === 'ruby-base' || display === 'ruby-text'
}

export function decorationBoxTop(candidate: Element, top: number, origin: number, borderTop: number): number {
  if (candidate.tagName !== 'TH' && candidate.tagName !== 'TD') return top - origin
  if (borderTop <= 0) return top - origin
  const table = candidate.closest('table')
  return getComputedStyle(table ?? candidate).borderCollapse === 'collapse' ? top - origin + borderTop + 0.5 : top - origin
}

export function measuredDecorationBoxes(element: Element, origin: number, elementStyle: CSSStyleDeclaration): MeasuredDecorationBox[] {
  const boxes: MeasuredDecorationBox[] = []
  const candidates = [element, ...element.querySelectorAll('*')]
  for (const [index, candidate] of candidates.entries()) {
    const style = index === 0 ? elementStyle : getComputedStyle(candidate)
    const rootSkipped =
      style.display === 'none' || style.display === 'contents' || style.display === 'ruby' || style.display === 'ruby-base' || style.display === 'ruby-text'
    if (index === 0 ? rootSkipped : skippableDescendantBoxDisplay(style.display)) continue
    const shadowValue = String(style.boxShadow)
    const shadows = parseBoxShadows(shadowValue)
    if (shadows === undefined) {
      const shown = shadowValue.length > 256 ? `${shadowValue.slice(0, 253)}...` : shadowValue
      throw new Error(
        `The computed box-shadow ${JSON.stringify(shown)} could not be read as a color followed by three or four pixel lengths; removing or simplifying that element's box-shadow clears this refusal.`,
      )
    }
    const rect = candidate.getBoundingClientRect()
    const borderTop = Number.parseFloat(style.borderBlockStartWidth) || 0
    boxes.push({
      top: decorationBoxTop(candidate, rect.top, origin, borderTop),
      bottom: rect.bottom - origin,
      borderTop,
      borderBottom: Number.parseFloat(style.borderBlockEndWidth) || 0,
      background: backgroundPaints(style.backgroundColor, style.backgroundImage),
      shadows,
      outlineWidth: style.outlineStyle === 'none' ? 0 : Number.parseFloat(style.outlineWidth) || 0,
      outlineOffset: Number.parseFloat(style.outlineOffset) || 0,
    })
  }
  return boxes
}

export function measuredBlockConstraints(display: string, orphans: number, widows: number): { orphans?: number; widows?: number } {
  const blockContainers = ['block', 'flow-root', 'list-item', 'inline-block', 'table-cell', 'table-caption']
  if (!blockContainers.includes(display)) return {}
  return {
    ...(Number.isFinite(orphans) && orphans > 0 ? { orphans } : {}),
    ...(Number.isFinite(widows) && widows > 0 ? { widows } : {}),
  }
}

export function measuredCandidateRun(
  lines: readonly MeasuredLineBox[],
  candidate: Pick<MeasuredKeepCandidate, 'top' | 'bottom'>,
): { start: number; end: number } | undefined {
  const indexes = lines.flatMap((line, index) => {
    return lineWithinBox(line, candidate) ? [index] : []
  })
  const start = indexes[0]
  const last = indexes.at(-1)
  return start === undefined || last === undefined ? undefined : { start, end: last + 1 }
}

export function measuredCandidateKeeps(lines: readonly MeasuredLineBox[], candidate: MeasuredKeepCandidate): MeasuredKeeps {
  const run = measuredCandidateRun(lines, candidate)
  if (!run) return { keepRuns: [] }
  const keepRuns: Array<{ start: number; end: number }> = []
  if (candidate.avoidInside) keepRuns.push(run)
  if (candidate.keepWithNext && run.end < lines.length) keepRuns.push({ start: run.start, end: run.end + 1 })
  if (candidate.keepWithNext && run.end === lines.length && run.end - run.start > 1 && !candidate.avoidInside) keepRuns.push(run)
  if (candidate.keepWithPrevious && run.start > 0) keepRuns.push({ start: run.start - 1, end: run.start + 1 })
  return {
    keepRuns,
    ...(candidate.keepWithNext && run.end === lines.length ? { keepWithNextFrom: run.start } : {}),
    ...(candidate.keepWithPrevious && run.start === 0 ? { keepWithPrevious: true } : {}),
  }
}

export function measuredKeepRuns(lines: readonly MeasuredLineBox[], candidates: readonly MeasuredKeepCandidate[]): MeasuredKeeps {
  const runsByRange = new Map<string, { start: number; end: number }>()
  let keepWithNextFrom: number | undefined
  let keepWithPrevious = false

  for (const candidate of candidates) {
    const measured = measuredCandidateKeeps(lines, candidate)
    for (const run of measured.keepRuns) runsByRange.set(`${run.start}:${run.end}`, run)
    if (measured.keepWithNextFrom !== undefined)
      keepWithNextFrom = keepWithNextFrom === undefined ? measured.keepWithNextFrom : Math.min(keepWithNextFrom, measured.keepWithNextFrom)
    if (measured.keepWithPrevious) keepWithPrevious = true
  }

  return {
    keepRuns: [...runsByRange.values()],
    ...(keepWithNextFrom === undefined ? {} : { keepWithNextFrom }),
    ...(keepWithPrevious ? { keepWithPrevious } : {}),
  }
}

export function flowTextArea(
  rules: ParentRules | undefined,
  areas: Record<string, TextArea>,
  kind = 'chapter',
  role?: 'body' | 'fixed',
  defaults?: typeof defaultParentRules,
): TextArea {
  const selectedRules = rules ?? (defaults ?? defaultParentRules)(kind, role)
  const names = [...new Set(textHoldingParentRules(selectedRules).map((rule) => rule.parent))]
  const selected = names.map((name) => areas[name])
  if (selected.length === 0 || selected.some((area) => !area)) throw new Error('A flow parent has no text area.')
  return { width: selected[0]?.width ?? 0, height: Math.min(...selected.map((area) => area?.height ?? 0)) }
}

export function forcedPageBreak(value: string): boolean {
  return value === 'page' || value === 'left' || value === 'right' || value === 'recto' || value === 'verso'
}

export function composerLayoutReady(flow: Element | null): boolean {
  return Boolean(flow && flow.getClientRects().length > 0)
}

export function measurementRefusal(subject: string, missingFlows: readonly string[]): string {
  if (missingFlows.length > 0) {
    return `${subject} could not establish measured lines for source flows ${missingFlows.join(', ')}; allow every named flow to finish layout and yield a line to clear this refusal.`
  }
  return `${subject} could not measure line boxes or plan a page because the frame or galley has no size, or layout stayed deferred; give the frame and galley a non-zero size or allow layout to finish to clear this refusal.`
}

export function sizeFlowGalley(flow: HTMLElement, width: number, height: number, orphans: number, widows: number): void {
  flow.style.inlineSize = `${width}px`
  flow.style.setProperty('--segnavia-text-height', `${height}px`)
  flow.style.orphans = String(orphans)
  flow.style.widows = String(widows)
}

export function measureLineBoxes(element: Element, origin: number): MeasuredLineBox[] {
  const tag = element.tagName.toLowerCase()
  if (tag === 'img') {
    const box = element.getBoundingClientRect()
    return [{ top: box.top - origin, bottom: box.bottom - origin }]
  }
  const display = getComputedStyle(element).display
  if (display === 'table' || display === 'inline-table') {
    return tableRenderedInFlow(element) ? measureTableLines(element, origin) : []
  }
  const tables = Array.from(element.querySelectorAll('table'))
    .filter((table) => {
      if (insideSideNote(table)) return false
      if (!tableRenderedInFlow(table)) return false
      let ancestor = table.parentElement
      while (ancestor && ancestor !== element) {
        if (ancestor.tagName === 'TABLE') return false
        ancestor = ancestor.parentElement
      }
      return true
    })
    .map((table) => {
      const box = table.getBoundingClientRect()
      return { top: box.top - origin, bottom: box.bottom - origin, lines: measureTableLines(table, origin) }
    })
  if (tag === 'figure' && tables.length === 0) {
    const box = element.getBoundingClientRect()
    return [{ top: box.top - origin, bottom: box.bottom - origin }]
  }
  const groups: MeasuredLineBox[] = []
  for (const range of contentRangesExcludingSideNotes(element)) {
    for (const rect of range.getClientRects()) {
      const top = rect.top - origin
      const bottom = rect.bottom - origin
      const found = groups.find((group) => Math.abs(group.top - top) < 0.5)
      if (!found) groups.push({ top, bottom })
      else if (bottom > found.bottom) found.bottom = bottom
    }
  }
  groups.sort((left, right) => left.top - right.top)
  if (groups.length > 0 || tables.length > 0) return linesWithDescendantTables(groups, tables)
  const box = element.getBoundingClientRect()
  return box.height > 0 ? [{ top: box.top - origin, bottom: box.bottom - origin }] : []
}

export function applyBoxDecorations(lines: readonly PaginateLine[], boxes: readonly MeasuredDecorationBox[]): PaginateLine[] {
  const decorated = lines.map((line) => ({ ...line }))
  for (const box of boxes) {
    const run = measuredCandidateRun(decorated, box)
    if (!run) continue
    const first = run.start
    const last = run.end - 1
    const firstLine = decorated[first]
    const lastLine = decorated[last]
    if (!firstLine || !lastLine) continue
    const edges = decorationEdges(box)
    if (edges.top !== undefined) firstLine.decorationTop = Math.min(firstLine.decorationTop ?? edges.top, edges.top)
    if (edges.bottom !== undefined) lastLine.decorationBottom = Math.max(lastLine.decorationBottom ?? edges.bottom, edges.bottom)
  }
  return decorated
}
