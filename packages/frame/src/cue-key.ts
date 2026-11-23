import type { DeckState } from './controller-types.ts'

export function cueKey(shown: DeckState['shown']): string {
  return shown === null ? 'all' : shown.join(',')
}
