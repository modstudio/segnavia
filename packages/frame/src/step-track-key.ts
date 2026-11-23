import type { TextDirection } from '@segnavia/format'

export function stepTrackKeyTarget(
  key: string,
  currentIndex: number,
  slideCount: number,
  direction: TextDirection,
  furthestAllowedIndex: number,
): number | null {
  if (slideCount === 0) return null
  const lastIndex = slideCount - 1
  if (key === 'Home') return 0
  if (key === 'End') return Math.max(0, Math.min(lastIndex, furthestAllowedIndex))
  const inlineNext = key === (direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight')
  if (inlineNext || key === 'ArrowDown' || key === 'PageDown') return Math.min(lastIndex, currentIndex + 1)
  const inlinePrevious = key === (direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft')
  if (inlinePrevious || key === 'ArrowUp' || key === 'PageUp') return Math.max(0, currentIndex - 1)
  return null
}
