import { Book, type BookInput, Page, type PageInput } from '@segnavia/format'
import { frameDocument, newNonce } from '@segnavia/frame/bridge'
import { expandFramePage, type FontsOptions, type MotifsOptions, pageFontCss, resolveFontReferences } from '@segnavia/frame/motifs'
import { fontFaces } from './font-faces.ts'
import type { RenderOptions } from './options.ts'
import { containFixedPageOverflow } from './overflow-containment.ts'
import { printCss } from './page-paper.ts'

export function renderFonts(options: RenderOptions): FontsOptions | undefined {
  return options.fontSource ? { source: options.fontSource } : undefined
}

export function withFontCss(options: RenderOptions, css: string): RenderOptions {
  return { ...options, css: `${css}${options.css ?? ''}` }
}

export async function prepareRenderedPage(input: PageInput, options: RenderOptions, motifs: MotifsOptions | undefined, signal: AbortSignal) {
  const prepared = await preparePagePdfPage(Page.parse(input), motifs, renderFonts(options), signal)
  return { page: prepared.page, options: withFontCss(options, prepared.css) }
}

export async function renderOptionsWithBookFonts(input: BookInput, options: RenderOptions, signal: AbortSignal): Promise<RenderOptions> {
  if (!options.fontSource) return options
  const book = Book.parse(input)
  const css = await resolveFontReferences(book.fonts ?? [], { source: options.fontSource }, signal, `book ${JSON.stringify(book.title)}`)
  return withFontCss(options, css)
}

export async function preparePagePdfPage(
  page: Page,
  motifs: MotifsOptions | undefined,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
): Promise<{ page: Page; css: string }> {
  const expanded = await expandFramePage(page, motifs, signal)
  return { page: expanded.page, css: await pageFontCss(expanded.page, expanded.fonts, fonts, signal) }
}

export function renderPageDocument(page: Page, options: RenderOptions, printing = false, nonce?: string, fontCss = ''): string {
  const hostCss = `${page.print ? printCss(page.print) : ''}${fontCss}${fontFaces(options.fonts)}${options.css ?? ''}`
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
