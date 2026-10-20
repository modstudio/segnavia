import type { TextDirection } from '@segnavia/format'

export function railSelection(current: number, key: string, count: number, horizontal: boolean, direction: TextDirection): number {
  let offset = 0
  if (!horizontal && key === 'ArrowUp') offset = -1
  if (!horizontal && key === 'ArrowDown') offset = 1
  if (horizontal && key === 'ArrowLeft') offset = direction === 'rtl' ? 1 : -1
  if (horizontal && key === 'ArrowRight') offset = direction === 'rtl' ? -1 : 1
  return Math.max(0, Math.min(count - 1, current + offset))
}

export function railMoveTarget(fromIndex: number, overIndex: number, after: boolean, count: number): number {
  const insertion = overIndex + (after ? 1 : 0)
  return Math.max(0, Math.min(count - 1, insertion > fromIndex ? insertion - 1 : insertion))
}

// Whether the list hides items before or after the visible part. The offset's
// magnitude is read so a right-to-left list, whose offset is negative, agrees.
export function railOverflow(offset: number, viewport: number, content: number): { before: boolean; after: boolean } {
  const start = Math.abs(offset)
  return { before: start > 1, after: start + viewport < content - 1 }
}
