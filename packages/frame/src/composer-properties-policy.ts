import type { MeasuredProperty, MeasureKind } from '@segnavia/format'

export interface PropertyStageState<T> {
  done: boolean
  results: T
}

export interface LogicalRect {
  width: number
  height: number
  top: number
  left: number
}

export function runPropertyStageOnce<T>(state: PropertyStageState<T>, execute: () => T): T {
  if (state.done) return state.results
  state.done = true
  state.results = execute()
  return state.results
}

export function verticalWritingMode(writingMode: string): boolean {
  return writingMode.startsWith('vertical') || writingMode.startsWith('sideways')
}

export function logicalExtent(rect: Pick<LogicalRect, 'width' | 'height'>, writingMode: string, axis: 'inline' | 'block'): number {
  const vertical = verticalWritingMode(writingMode)
  return axis === 'inline' ? (vertical ? rect.height : rect.width) : vertical ? rect.width : rect.height
}

export function logicalLineCount(rects: readonly LogicalRect[], writingMode: string): number {
  const vertical = verticalWritingMode(writingMode)
  const starts: number[] = []
  for (const rect of rects) {
    const start = vertical ? rect.left : rect.top
    if (!starts.some((held) => Math.abs(held - start) < 0.5)) starts.push(start)
  }
  return starts.length
}

export function propertyValue(kind: MeasureKind, value: number): string {
  const held = Math.max(0, value)
  return kind === 'line-count' ? String(Math.round(held)) : `${String(Math.round(held * 10_000) / 10_000)}px`
}

export function measuredProperties(properties: readonly MeasuredProperty[]): MeasuredProperty[] {
  return properties.filter((property, index, all) => all.findIndex((candidate) => candidate.id === property.id && candidate.name === property.name) === index)
}
