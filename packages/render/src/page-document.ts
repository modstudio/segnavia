import { Book, type BookInput, type FontReference, Page, type PageInput } from '@segnavia/format'
import { frameDocument, newNonce } from '@segnavia/frame/bridge'
import { expandedPagesFontCss, FontRefusedError, type FontsOptions, pageFontCss, resolveFontReferences, uniqueFontReferences } from '@segnavia/frame/fonts'
import { expandFramePage, type MotifsOptions } from '@segnavia/frame/motifs'
import { FontCssRefusedError } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'
import { fontFaces } from './font-faces.ts'
import { localFontsForRender } from './local-fonts.ts'
import type { RenderOptions } from './options.ts'
import { containFixedPageOverflow } from './overflow-containment.ts'
import { printCss } from './page-paper.ts'

export function withFontCss(options: RenderOptions, css: string): RenderOptions {
  return { ...options, css: `${css}${options.css ?? ''}` }
}

export async function fontCssForRender(work: Promise<string>): Promise<string> {
  try {
    return await work
  } catch (error) {
    if (error instanceof FontCssRefusedError || error instanceof FontRefusedError) throw new RenderRefusedError(error.message)
    throw error
  }
}

export async function prepareRenderedPage(input: PageInput, options: RenderOptions, motifs: MotifsOptions | undefined, signal: AbortSignal) {
  const page = Page.parse(input)
  const expanded = await expandFramePage(page, motifs, signal)
  const references = uniqueFontReferences([...(expanded.page.fonts ?? []), ...expanded.fonts])
  const local = localFontsForRender(options.localFonts, references)
  const fonts = options.fontSource || options.localFonts ? { source: options.fontSource, local: local.faces } : undefined
  const prepared = { page: expanded.page, css: await fontCssForRender(pageFontCss(expanded.page, expanded.fonts, fonts, signal)) }
  options.localFonts?.report?.(local.report)
  return { page: prepared.page, options: withFontCss(options, prepared.css) }
}

export async function prepareRenderedPages(
  expanded: ReadonlyArray<{ page: Page; fonts: FontReference[] }>,
  options: RenderOptions,
  signal: AbortSignal,
): Promise<RenderOptions> {
  const references = uniqueFontReferences([...expanded.flatMap((item) => item.page.fonts ?? []), ...expanded.flatMap((item) => item.fonts)])
  const local = localFontsForRender(options.localFonts, references)
  const fonts = options.fontSource || options.localFonts ? { source: options.fontSource, local: local.faces } : undefined
  const css = await fontCssForRender(expandedPagesFontCss(expanded, fonts, signal))
  options.localFonts?.report?.(local.report)
  return withFontCss(options, css)
}

export async function renderOptionsWithBookFonts(input: BookInput, options: RenderOptions, signal: AbortSignal): Promise<RenderOptions> {
  const book = Book.parse(input)
  const place = `book ${JSON.stringify(book.title)}`
  const references = book.fonts ?? []
  const local = localFontsForRender(options.localFonts, references)
  const css = await fontCssForRender(resolveFontReferences(references, { source: options.fontSource, local: local.faces }, signal, place))
  options.localFonts?.report?.(local.report)
  return withFontCss(options, css)
}

export async function preparePagePdfPage(
  page: Page,
  motifs: MotifsOptions | undefined,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
): Promise<{ page: Page; css: string }> {
  const expanded = await expandFramePage(page, motifs, signal)
  return { page: expanded.page, css: await fontCssForRender(pageFontCss(expanded.page, expanded.fonts, fonts, signal)) }
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
