import type { NumberedPage } from '@segnavia/format'

export function deckNumbering(count: number): NumberedPage[] {
  return Array.from({ length: count }, () => ({
    numbering: { system: 'arabic', start: 1, restart: false, counted: true },
  }))
}
