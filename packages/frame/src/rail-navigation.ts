import type { TextDirection } from '@segnavia/format'

export function railSelection(current: number, key: string, count: number, horizontal: boolean, direction: TextDirection): number {
  let offset = 0
  if (!horizontal && key === 'ArrowUp') offset = -1
  if (!horizontal && key === 'ArrowDown') offset = 1
  if (horizontal && key === 'ArrowLeft') offset = direction === 'rtl' ? 1 : -1
  if (horizontal && key === 'ArrowRight') offset = direction === 'rtl' ? -1 : 1
  return Math.max(0, Math.min(count - 1, current + offset))
}
