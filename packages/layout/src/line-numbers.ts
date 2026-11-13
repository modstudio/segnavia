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

function windowLines(
  measurements: Measurements,
  window: NumberWindow,
): Array<{ line: { top: number; bottom: number }; direction: 'ltr' | 'rtl'; chapter: number }> {
  const flow = measurements.flows.find((candidate) => candidate.id === window.flow)
  if (!flow || !('blocks' in flow)) return []
  return flow.blocks.flatMap((block) =>
    !block.numbered || block.kind !== 'text'
      ? []
      : block.lines
          .filter((line) => line.counted !== false && line.top >= window.start && line.top < window.end)
          .map((line) => ({ line, direction: block.direction, chapter: block.position.chapter })),
  )
}

export function numberLinesScript(): string {
  return `${tiledPageGroups.toString()}\n${windowAnchorTop.toString()}\n${windowLines.toString()}\n${resolveMarginSide.toString()}\n${numberLabel.toString()}\n${expandLineNumberTiles.toString()}\n${numberLines.toString()}\nvar numberLines=${numberLines.name};`
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

export function numberLines(measurements: Measurements, plan: Plan, settings: ResolvedLineNumbers): readonly PageLineNumbers[] {
  const groups = tiledPageGroups(plan)
  const sourceResult = groups.map((_group, page) => ({ page, lines: [] as NumberedLine[] }))
  let counter = settings.start
  let previousFlow: string | undefined
  let previousChapter: number | undefined
  for (let pageIndex = 0; pageIndex < groups.length; pageIndex += 1) {
    const page = groups[pageIndex]!.tiles[0]!.page
    if (settings.restart === 'page') counter = settings.start
    const windows = page.windows
    for (const window of windows) {
      for (const { line, direction, chapter } of windowLines(measurements, window)) {
        if (settings.restart === 'section' && (window.flow !== previousFlow || chapter !== previousChapter)) counter = settings.start
        const value = counter
        counter += 1
        previousFlow = window.flow
        previousChapter = chapter
        if (value % settings.interval !== 0) continue
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
    }
  }
  return expandLineNumberTiles(plan, groups, sourceResult)
}
