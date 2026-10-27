import type { Page } from '@segnavia/format'
import { newNonce } from '@segnavia/frame/bridge'
import { printedPageDocument } from '@segnavia/frame/printed-page-document'
import { fontFaces } from './font-faces.ts'
import type { RenderOptions } from './options.ts'
import { renderPageDocument } from './page-document.ts'

export function renderedPageDocument(page: Page, options: RenderOptions, printing = false): string {
  if (!page.printedPages) return renderPageDocument(page, options, printing)
  return printedPageDocument(page, { nonce: newNonce(), css: `${fontFaces(options.fonts)}${options.css ?? ''}` })
}
