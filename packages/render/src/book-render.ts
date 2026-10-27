import { type Book, type BookInput, PX_PER_MM, resolveDirection, sheetMm } from '@segnavia/format'
import { frameDocument, newNonce } from '@segnavia/frame/bridge'
import {
  BOOK_COMPOSED_ATTRIBUTE,
  BOOK_FAILURE_ATTRIBUTE,
  bookDocument as paginatedBookDocument,
  PaginatedBookRefusedError,
} from '@segnavia/frame/book-document'
import type { Page as Tab } from 'playwright-core'
import { bookPageCss, renderBookPdf } from './book-pdf.ts'
import { RenderRefusedError } from './errors.ts'
import type { RenderOptions } from './options.ts'
import type { BookOverflowPart, PrintResult } from './overflow.ts'
import { pagePdfSize } from './pdf-page-size.ts'

async function awaitBookComposition(tab: Tab): Promise<void> {
  await tab.waitForFunction(({ composed, failed }) => document.documentElement.hasAttribute(composed) || document.documentElement.hasAttribute(failed), {
    composed: BOOK_COMPOSED_ATTRIBUTE,
    failed: BOOK_FAILURE_ATTRIBUTE,
  })
  const failure = await tab.evaluate((attribute) => document.documentElement.getAttribute(attribute), BOOK_FAILURE_ATTRIBUTE)
  if (failure) throw new RenderRefusedError(failure)
}

interface TabSetup {
  viewport: { width: number; height: number }
  scripts: boolean
  html: string
  waitForReady: boolean
  boundMs?: number
  beforeOutput?: (tab: Tab) => Promise<void>
}

export interface BrowserBookDependencies {
  render(setup: TabSetup, pdf: Parameters<Tab['pdf']>[0], pageWidth: number, part: BookOverflowPart): Promise<PrintResult<true>>
  fontFaces(options: RenderOptions): string
  finish(pdf: Uint8Array, options: RenderOptions): Promise<Uint8Array>
}

export function renderBrowserBookPdf(input: BookInput, options: RenderOptions, dependencies: BrowserBookDependencies): Promise<Uint8Array> {
  return renderBookPdf(input, options, {
    print: (html: string, book: Book, renderOptions: RenderOptions, part: BookOverflowPart, layerCss = '') => {
      if (!book.page) throw new RenderRefusedError('Printing a book needs page; set page before calling bookPdf.')
      const size = sheetMm(book.page)
      const paginated = book.mode === 'paginated'
      const marginLayer = part === 'margin'
      const css = `${bookPageCss(book, marginLayer || paginated)}${layerCss}${dependencies.fontFaces(renderOptions)}${renderOptions.css ?? ''}`
      const nonce = newNonce()
      let srcdoc: string
      try {
        srcdoc = paginated
          ? paginatedBookDocument(book, { nonce, css, printBackground: true })
          : frameDocument(html, {
            scripts: marginLayer ? 'refuse' : book.scripts,
            nonce,
            dir: marginLayer ? 'ltr' : resolveDirection(book.dir, book.lang, book.title),
            lang: book.lang,
            css,
            relayKeys: false,
            reportHeight: false,
          })
      } catch (error) {
        if (error instanceof PaginatedBookRefusedError) throw new RenderRefusedError(error.message)
        throw error
      }
      return dependencies.render(
        {
          viewport: { width: Math.round(size.width * PX_PER_MM), height: Math.round(size.height * PX_PER_MM) },
          scripts: paginated || (!marginLayer && book.scripts === 'sandboxed'),
          html: srcdoc,
          waitForReady: !paginated && !marginLayer && book.scripts === 'sandboxed' && renderOptions.waitForPageReady !== false,
          boundMs: renderOptions.boundMs,
          beforeOutput: paginated
            ? async (tab) => {
                await awaitBookComposition(tab)
                await renderOptions.beforeOutput?.(tab)
              }
            : renderOptions.beforeOutput,
        },
        {
          ...pagePdfSize(size),
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        },
        Math.round(size.width * PX_PER_MM),
        part,
      )
    },
    finish: dependencies.finish,
  })
}
