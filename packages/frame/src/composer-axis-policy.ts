export interface LogicalRect {
  width: number
  height: number
}

export function verticalWritingMode(writingMode: string): boolean {
  return writingMode.startsWith('vertical') || writingMode.startsWith('sideways')
}

export function logicalExtent(rect: LogicalRect, writingMode: string, axis: 'inline' | 'block'): number {
  const vertical = verticalWritingMode(writingMode)
  return axis === 'inline' ? (vertical ? rect.height : rect.width) : vertical ? rect.width : rect.height
}
