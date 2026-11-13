import { formatNumber, type LineNumbers, type Measurements, numberSystemMaximum, type Plan, type ResolvedLineNumbers } from '@segnavia/format'

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
  return `${windowLines.toString()}\n${resolveMarginSide.toString()}\n${numberLabel.toString()}\n${numberLines.toString()}\nvar numberLines=${numberLines.name};`
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

type TiledPage = Plan['pages'][number] & { inlineTile?: number }

export function numberLines(measurements: Measurements, plan: Plan, settings: ResolvedLineNumbers): readonly PageLineNumbers[] {
  const sourcePages = (plan.pages as readonly TiledPage[]).filter((page) => page.inlineTile === undefined || page.inlineTile === 0)
  const sourceResult = sourcePages.map((_page, page) => ({ page, lines: [] as NumberedLine[] }))
  let counter = settings.start
  let previousFlow: string | undefined
  let previousChapter: number | undefined
  for (let pageIndex = 0; pageIndex < sourcePages.length; pageIndex += 1) {
    const page = sourcePages[pageIndex]
    if (!page) continue
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
          top: window.top + line.top - window.start,
          height: line.bottom - line.top,
          column: window.column,
          columns: window.columns,
          side: resolveMarginSide(settings.side, page, direction),
        })
      }
    }
  }
  let sourceIndex = -1
  return (plan.pages as readonly TiledPage[]).map((page, pageIndex) => {
    if (page.inlineTile === undefined || page.inlineTile === 0) sourceIndex += 1
    return { page: pageIndex, lines: sourceResult[sourceIndex]?.lines.map((line) => ({ ...line })) ?? [] }
  })
}
