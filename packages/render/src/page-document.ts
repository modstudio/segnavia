import type { Page } from '@segnavia/format'
import { frameDocument, newNonce } from '@segnavia/frame/bridge'
import { expandFramePage, type MotifsOptions } from '@segnavia/frame/motifs'
import { fontFaces } from './font-faces.ts'
import type { RenderOptions } from './options.ts'
import { containFixedPageOverflow } from './overflow-containment.ts'
import { printCss } from './page-paper.ts'

export function preparePagePdfPage(page: Page, motifs: MotifsOptions | undefined, signal: AbortSignal): Promise<Page> {
  return expandFramePage(page, motifs, signal)
}

export function renderPageDocument(page: Page, options: RenderOptions, printing = false, nonce?: string): string {
  const hostCss = `${page.print ? printCss(page.print) : ''}${fontFaces(options.fonts)}${options.css ?? ''}`
  const fixedSize = typeof page.size === 'object' && page.size.height !== 'auto'
  const css = printing && !page.print && fixedSize ? containFixedPageOverflow(hostCss) : hostCss
  return frameDocument(page.html, {
    scripts: page.scripts,
    nonce: nonce ?? newNonce(),
    dir: page.dir,
    lang: page.lang,
    css,
    relayKeys: false,
    reportHeight: false,
  })
}
