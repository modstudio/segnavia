import { defaultParentRules, type ParentRules, type TextArea, textHoldingParentRules } from '@segnavia/format'

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
    const middle = (line.top + line.bottom) / 2
    return middle >= candidate.top - 0.5 && middle <= candidate.bottom + 0.5 ? [index] : []
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

export interface TableRowMeasurement {
  top: number
  bottom: number
  boxes: Array<{ top: number; bottom: number }>
}

export function tableRowLines(rows: readonly TableRowMeasurement[]): Array<{ top: number; bottom: number }> {
  return rows.flatMap((row) => {
    const boxes = [...row.boxes].sort((left, right) => left.top - right.top)
    const groups: Array<{ top: number; bottom: number }> = []
    for (const box of boxes) {
      const group = groups.at(-1)
      if (group && box.top < group.bottom && box.bottom > group.top) group.bottom = Math.max(group.bottom, box.bottom)
      else groups.push({ ...box })
    }
    if (groups.length === 0) return [{ top: row.top, bottom: row.bottom }]
    return groups.map((group, index) => ({
      top: index === 0 ? row.top : group.top,
      bottom: groups[index + 1]?.top ?? row.bottom,
    }))
  })
}

export function measureLineBoxes(element: Element, origin: number): Array<{ top: number; bottom: number }> {
  const tag = element.tagName.toLowerCase()
  if (tag === 'img' || tag === 'figure') {
    const box = element.getBoundingClientRect()
    return [{ top: box.top - origin, bottom: box.bottom - origin }]
  }
  const display = getComputedStyle(element).display
  if (display === 'table' || display === 'inline-table') {
    const rows = Array.from(element.querySelectorAll('tr')).map((row) => {
      const rowBox = row.getBoundingClientRect()
      const boxes: Array<{ top: number; bottom: number }> = []
      for (const cell of row.querySelectorAll(':scope > th, :scope > td')) {
        const walker = element.ownerDocument.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode()
        while (node) {
          const textRange = element.ownerDocument.createRange()
          textRange.selectNodeContents(node)
          for (const rect of textRange.getClientRects()) boxes.push({ top: rect.top - origin, bottom: rect.bottom - origin })
          node = walker.nextNode()
        }
        for (const replaced of cell.querySelectorAll('img,svg,video,canvas,picture,iframe,object,embed,math')) {
          const box = replaced.getBoundingClientRect()
          boxes.push({ top: box.top - origin, bottom: box.bottom - origin })
        }
      }
      return { top: rowBox.top - origin, bottom: rowBox.bottom - origin, boxes }
    })
    return tableRowLines(rows)
  }
  const range = element.ownerDocument.createRange()
  range.selectNodeContents(element)
  const groups: Array<{ top: number; bottom: number }> = []
  for (const rect of range.getClientRects()) {
    const top = rect.top - origin
    const bottom = rect.bottom - origin
    const found = groups.find((group) => Math.abs(group.top - top) < 0.5)
    if (!found) groups.push({ top, bottom })
    else if (bottom > found.bottom) found.bottom = bottom
  }
  groups.sort((left, right) => left.top - right.top)
  if (groups.length > 0) return groups
  const box = element.getBoundingClientRect()
  return box.height > 0 ? [{ top: box.top - origin, bottom: box.bottom - origin }] : []
}
