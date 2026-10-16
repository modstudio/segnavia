import { type Book, type BookInput, PX_PER_MM, resolveDirection, sheetMm } from '@segnavia/format'
import { frameDocument, newNonce } from '@segnavia/frame/bridge'
import type { Page as Tab } from 'playwright-core'
import { marginCss } from './book-margins.ts'
import { bookPageCss, renderBookPdf } from './book-pdf.ts'
import { RenderRefusedError } from './errors.ts'
import type { RenderOptions } from './options.ts'
import type { BookOverflowPart, PrintResult } from './overflow.ts'

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
    print: (html: string, book: Book, renderOptions: RenderOptions, part: BookOverflowPart) => {
      if (!book.page) throw new RenderRefusedError('Printing a continuous book needs page; set page before calling bookPdf.')
      const size = sheetMm(book.page)
      const marginLayer = part === 'margin'
      const css = `${bookPageCss(book, marginLayer)}${marginLayer ? marginCss(book) : ''}${dependencies.fontFaces(renderOptions)}${renderOptions.css ?? ''}`
      return dependencies.render(
        {
          viewport: { width: Math.round(size.width * PX_PER_MM), height: Math.round(size.height * PX_PER_MM) },
          scripts: !marginLayer && book.scripts === 'sandboxed',
          html: frameDocument(html, {
            scripts: marginLayer ? 'refuse' : book.scripts,
            nonce: newNonce(),
            dir: marginLayer ? 'ltr' : resolveDirection(book.dir, book.lang, book.title),
            lang: book.lang,
            css,
            relayKeys: false,
            reportHeight: false,
          }),
          waitForReady: !marginLayer && book.scripts === 'sandboxed' && renderOptions.waitForPageReady !== false,
          boundMs: renderOptions.boundMs,
          beforeOutput: renderOptions.beforeOutput,
        },
        {
          width: `${size.width}mm`,
          height: `${size.height}mm`,
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
