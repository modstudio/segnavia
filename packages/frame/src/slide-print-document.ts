import type { Deck } from '@segnavia/format'
import { frameDocument, frameStyleSheets } from './bridge.ts'
import { withDiagramScript } from './diagram-document.ts'

export const PRINT_COLOR_CSS = '*,*::before,*::after{print-color-adjust:exact;-webkit-print-color-adjust:exact}'

export function htmlSlideDocument(
  deck: Pick<Deck, 'scripts' | 'dir' | 'lang' | 'style' | 'title'>,
  html: string,
  options: { baseCss?: string; css?: string; nonce: string; printAtMs?: number; dependencyOrigins?: Iterable<string>; diagramScript?: string },
): string {
  return frameDocument(withDiagramScript(html, options.nonce, options.diagramScript), {
    scripts: deck.scripts,
    nonce: options.nonce,
    dir: deck.dir,
    lang: deck.lang,
    sheets: frameStyleSheets(deck.style, `${PRINT_COLOR_CSS}${options.baseCss ?? ''}`),
    css: options.css,
    reportHeight: false,
    relayKeys: false,
    printAtMs: options.printAtMs ?? 0,
    printBackground: true,
    dependencyOrigins: options.dependencyOrigins,
  })
}
