import type { MeasuredLineBox } from './composer-measure.ts'

export function sideNoteKind(note: { parentElement: Element | null }, flow: Element): 'block' | 'inline' {
  return note.parentElement === flow ? 'block' : 'inline'
}

export function inlineSideNoteAnchorTop(staticTop: number, containingLines: readonly MeasuredLineBox[]): number {
  let nearest: MeasuredLineBox | undefined
  for (const line of containingLines) if (!nearest || Math.abs(line.top - staticTop) < Math.abs(nearest.top - staticTop)) nearest = line
  if (!nearest || Math.abs(nearest.top - staticTop) >= 0.5) return nearest?.top ?? staticTop
  let adjacent: MeasuredLineBox | undefined
  for (const line of containingLines) {
    if (Math.abs(line.top - nearest.top) < 0.5) continue
    if (!adjacent || Math.abs(line.top - staticTop) < Math.abs(adjacent.top - staticTop)) adjacent = line
  }
  return adjacent && Math.abs(adjacent.top - staticTop) < (nearest.bottom - nearest.top) / 2 ? adjacent.top : nearest.top
}

export function sideNoteAnchorTop(
  kind: 'block' | 'inline',
  staticTop: number,
  containingLines: readonly MeasuredLineBox[],
  followingBlocks: ReadonlyArray<{ kind: string; lines: readonly MeasuredLineBox[] }>,
): number {
  if (kind === 'block') {
    for (const block of followingBlocks) {
      if (block.kind !== 'text') continue
      const line = block.lines.find((candidate) => candidate.counted !== false)
      if (line) return line.top
    }
    return staticTop
  }
  return inlineSideNoteAnchorTop(staticTop, containingLines)
}
