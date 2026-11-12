import { formatNumber, type LineNumbers, type Measurements, type NumberSystem, type Plan } from '@segnavia/format'

export interface NumberedLine {
  value: number
  label: string
  top: number
  height: number
  column: number
  columns: number
  side: 'left' | 'right'
}

export interface NumberedPage {
  page: number
  lines: NumberedLine[]
}

export type NumberLinesSettings = LineNumbers & { system: NumberSystem }

type NumberWindow = Plan['pages'][number]['windows'][number]

function windowLines(measurements: Measurements, window: NumberWindow): Array<{ line: { top: number; bottom: number }; direction: 'ltr' | 'rtl' }> {
  const flow = measurements.flows.find((candidate) => candidate.id === window.flow)
  if (!flow || !('blocks' in flow)) return []
  return flow.blocks.flatMap((block) =>
    !block.numbered || block.kind !== 'text'
      ? []
      : block.lines
          .filter((line) => line.top >= window.start && line.top < window.end)
          .map((line) => ({ line, direction: block.direction ?? measurements.settings.direction })),
  )
}

export function numberLinesScript(): string {
  return `${windowLines.toString()}\n${resolveLineNumberSide.toString()}\n${numberLines.toString()}\nvar numberLines=${numberLines.name};`
}

export function resolveLineNumberSide(side: LineNumbers['side'], page: Pick<Plan['pages'][number], 'side'>, direction: 'ltr' | 'rtl'): 'left' | 'right' {
  if (side === 'outer') return page.side
  if (side === 'inner') return page.side === 'left' ? 'right' : 'left'
  if (side === 'start') return direction === 'ltr' ? 'left' : 'right'
  return direction === 'ltr' ? 'right' : 'left'
}

export function numberLines(measurements: Measurements, plan: Plan, settings: NumberLinesSettings): readonly NumberedPage[] {
  const result = plan.pages.map((_page, page) => ({ page, lines: [] as NumberedLine[] }))
  let counter = settings.start
  let previousFlow: string | undefined
  for (let pageIndex = 0; pageIndex < plan.pages.length; pageIndex += 1) {
    const page = plan.pages[pageIndex]
    if (!page) continue
    if (settings.restart === 'page') counter = settings.start
    const windows = page.windows
    for (const window of windows) {
      if (settings.restart === 'section' && window.flow !== previousFlow) counter = settings.start
      for (const { line, direction } of windowLines(measurements, window)) {
        const value = counter
        counter += 1
        if (value % settings.interval !== 0) continue
        result[pageIndex]?.lines.push({
          value,
          label: formatNumber(value, settings.system),
          top: window.top + line.top - window.start,
          height: line.bottom - line.top,
          column: window.column,
          columns: window.columns,
          side: resolveLineNumberSide(settings.side, page, direction),
        })
      }
      previousFlow = window.flow
    }
  }
  return result
}
