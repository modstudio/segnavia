import type { Deck, OriginApproval } from '@segnavia/format'
import { expandLogoMotifs } from '@segnavia/html'
import { frameDocument, frameStyleSheets } from './bridge.ts'
import { frameBrandLogo } from './frame-style-sheets.ts'
import type { LoadedLayoutScript } from './layout.ts'

export const PRINT_COLOR_CSS = '*,*::before,*::after{print-color-adjust:exact;-webkit-print-color-adjust:exact}'

export function htmlSlideDocument(
  deck: Pick<Deck, 'scripts' | 'dir' | 'lang' | 'style' | 'brand' | 'brandName' | 'title'>,
  html: string,
  options: {
    baseCss?: string
    css?: string
    nonce: string
    printAtMs?: number
    origins?: Iterable<OriginApproval>
    layoutScripts?: readonly LoadedLayoutScript[]
  },
): string {
  const { logo, owner } = frameBrandLogo(deck)
  return frameDocument(expandLogoMotifs(html, logo, owner), {
    scripts: deck.scripts,
    nonce: options.nonce,
    dir: deck.dir,
    lang: deck.lang,
    fonts: deck.style?.fonts,
    sheets: frameStyleSheets(deck.style, deck.brand, `${PRINT_COLOR_CSS}${options.baseCss ?? ''}`),
    css: options.css,
    reportHeight: false,
    relayKeys: false,
    printAtMs: options.printAtMs ?? 0,
    printBackground: true,
    origins: options.origins,
    layoutScripts: options.layoutScripts,
  })
}
