import type { MeasuredLineBox } from './composer-measure.ts'

export function sideNoteKind(note: { parentElement: Element | null }, flow: Element): 'block' | 'inline' {
  return note.parentElement === flow ? 'block' : 'inline'
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
  return containingLines.find((line) => staticTop >= line.top - 0.5 && staticTop < line.bottom + 0.5)?.top ?? staticTop
}
