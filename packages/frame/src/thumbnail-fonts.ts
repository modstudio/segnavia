import type { Deck, OriginApproval } from '@segnavia/format'
import { EMPTY_RESOLVED_FONTS, type FontsOptions, resolveFonts } from './page-fonts.ts'

const preparations = new WeakMap<object, AbortController>()

export function cancelThumbnailFonts(host: object): void {
  preparations.get(host)?.abort()
  preparations.delete(host)
}

export function prepareThumbnailFonts(host: object): AbortController {
  cancelThumbnailFonts(host)
  const controller = new AbortController()
  preparations.set(host, controller)
  return controller
}

export function resolveThumbnailFonts(deck: Deck, options: FontsOptions | undefined, origins: Iterable<OriginApproval>, signal: AbortSignal) {
  return options ? resolveFonts(deck.style?.fonts, { ...options, origins, signal }) : EMPTY_RESOLVED_FONTS
}
