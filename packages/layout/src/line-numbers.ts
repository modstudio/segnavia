import { formatNumber, type LineNumbers, type Measurements, numberSystemMaximum, type Plan, type ResolvedLineNumbers } from '@segnavia/format'
import { tiledPageGroups, windowAnchorTop } from './tiled-pages.ts'

export interface NumberedLine {
  value: number
  label: string
  top: number
  height: number
  column: number
  columns: number
  side: 'left' | 'right'
}

export interface PageLineNumbers {
  page: number
  lines: NumberedLine[]
}

type NumberWindow = Plan['pages'][number]['windows'][number]

interface CountedPlanLine {
  value: number
  page: number
  window: NumberWindow
  line: { top: number; bottom: number }
  direction: 'ltr' | 'rtl'
  chapter: number
  block: number
}

export type LineKeyedLabelDecision = { id: string; value: number } | { id: string; refusal: string }

function windowLines(
  measurements: Measurements,
  window: NumberWindow,
): Array<{ line: { top: number; bottom: number }; direction: 'ltr' | 'rtl'; chapter: number; block: number }> {
  const flow = measurements.flows.find((candidate) => candidate.id === window.flow)
  if (!flow || !('blocks' in flow)) return []
  return flow.blocks.flatMap((block) =>
    !block.numbered || block.kind !== 'text'
      ? []
      : block.lines
          .filter((line) => line.counted !== false && line.top >= window.start && line.top < window.end)
          .map((line) => ({ line, direction: block.direction, chapter: block.position.chapter, block: block.position.block })),
  )
}

export function numberLinesScript(): string {
  return `${tiledPageGroups.toString()}\n${windowAnchorTop.toString()}\n${windowLines.toString()}\n${countedPlanLines.toString()}\n${resolveMarginSide.toString()}\n${numberLabel.toString()}\n${expandLineNumberTiles.toString()}\n${numberLines.toString()}\nvar numberLines=${numberLines.name};`
}

export function lineKeyedLabelsScript(): string {
  return `${lineKeyedLabels.toString()}\nvar lineKeyedLabels=${lineKeyedLabels.name};`
}

function expandLineNumberTiles(plan: Plan, groups: ReturnType<typeof tiledPageGroups>, source: readonly PageLineNumbers[]): PageLineNumbers[] {
  const result = plan.pages.map((_page, page) => ({ page, lines: [] as NumberedLine[] }))
  for (const group of groups) {
    for (const tile of group.tiles) result[tile.index] = { page: tile.index, lines: source[group.sourceIndex]?.lines.map((line) => ({ ...line })) ?? [] }
  }
  return result
}

export function resolveMarginSide(side: LineNumbers['side'], page: Pick<Plan['pages'][number], 'side'>, direction: 'ltr' | 'rtl'): 'left' | 'right' {
  if (side === 'outer') return page.side
  if (side === 'inner') return page.side === 'left' ? 'right' : 'left'
  if (side === 'start') return direction === 'ltr' ? 'left' : 'right'
  return direction === 'ltr' ? 'right' : 'left'
}

function numberLabel(value: number, system: ResolvedLineNumbers['system']): string {
  const maximum = numberSystemMaximum(system)
  if (maximum !== undefined && value > maximum) {
    throw new RangeError(
      `settings.lineNumbers value ${value} exceeds the ${system} numbering system maximum of ${maximum}; use arabic numbering or restart line numbers by section or page to clear this refusal`,
    )
  }
  return formatNumber(value, system)
}

function countedPlanLines(measurements: Measurements, plan: Plan, settings: ResolvedLineNumbers): CountedPlanLine[] {
  const groups = tiledPageGroups(plan)
  const result: CountedPlanLine[] = []
  let counter = settings.start
  let previousFlow: string | undefined
  let previousChapter: number | undefined
  for (const [pageIndex, group] of groups.entries()) {
    const page = group.tiles[0].page
    if (settings.restart === 'page') counter = settings.start
    for (const window of page.windows) {
      for (const held of windowLines(measurements, window)) {
        if (settings.restart === 'section' && (window.flow !== previousFlow || held.chapter !== previousChapter)) counter = settings.start
        result.push({ value: counter, page: pageIndex, window, ...held })
        counter += 1
        previousFlow = window.flow
        previousChapter = held.chapter
      }
    }
  }
  return result
}

/** Assigns each measured line-note anchor the value of the counted line that contains its start. */
export function lineKeyedLabels(measurements: Measurements, plan: Plan, settings: ResolvedLineNumbers): LineKeyedLabelDecision[] {
  const lines = countedPlanLines(measurements, plan, settings)
  return measurements.flows.flatMap((flow) =>
    (flow.lineNoteAnchors ?? []).map((anchor): LineKeyedLabelDecision => {
      const candidates = lines.filter((held) => held.window.flow === flow.id && held.block === anchor.block)
      const matched = candidates.find((held) => Math.abs(anchor.top - held.line.top) <= 0.5) ?? candidates.find((held) => anchor.top >= held.line.top && anchor.top < held.line.bottom)
      if (matched) return { id: anchor.id, value: matched.value }
      return {
        id: anchor.id,
        refusal: `line-keyed note ${anchor.id} starts on a line that line numbering does not count; move its lemma to a counted text line or remove line keying to clear this refusal`,
      }
    }),
  )
}

export function numberLines(measurements: Measurements, plan: Plan, settings: ResolvedLineNumbers): readonly PageLineNumbers[] {
  const groups = tiledPageGroups(plan)
  const sourceResult = groups.map((_group, page) => ({ page, lines: [] as NumberedLine[] }))
  for (const { value, page: pageIndex, window, line, direction } of countedPlanLines(measurements, plan, settings)) {
    if (value % settings.interval !== 0) continue
    const page = groups[pageIndex]?.tiles[0].page
    if (!page) continue
    sourceResult[pageIndex]?.lines.push({
      value,
      label: numberLabel(value, settings.system),
      top: windowAnchorTop(window, line.top),
      height: line.bottom - line.top,
      column: window.column,
      columns: window.columns,
      side: resolveMarginSide(settings.side, page, direction),
    })
  }
  return expandLineNumberTiles(plan, groups, sourceResult)
}
