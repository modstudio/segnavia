import type { Plan } from '@segnavia/format'

/** Maps a galley-coordinate anchor into its page window. */
export function windowAnchorTop(window: Plan['pages'][number]['windows'][number], top: number): number {
  return window.top + top - window.start
}
