import type { Deck, OriginApproval } from '@segnavia/format'
import { frameDocument, frameStyleSheets } from './bridge.ts'
import { withDiagramScript } from './diagram-document.ts'

export const PRINT_COLOR_CSS = '*,*::before,*::after{print-color-adjust:exact;-webkit-print-color-adjust:exact}'

export function htmlSlideDocument(
  deck: Pick<Deck, 'scripts' | 'dir' | 'lang' | 'style' | 'brand' | 'title'>,
  html: string,
  options: { baseCss?: string; css?: string; nonce: string; printAtMs?: number; origins?: Iterable<OriginApproval>; diagramScript?: string },
): string {
  return frameDocument(withDiagramScript(html, options.nonce, options.diagramScript), {
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
  })
}
