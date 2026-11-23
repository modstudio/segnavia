import type { Deck, OriginApproval } from '@segnavia/format'
import { type FontsOptions, resolveFonts } from './page-fonts.ts'

export function resolveThumbnailFonts(deck: Deck, options: FontsOptions | undefined, origins: Iterable<OriginApproval>) {
  return options ? resolveFonts(deck.style?.fonts, { ...options, origins, signal: new AbortController().signal }) : { css: '', failures: [] }
}
