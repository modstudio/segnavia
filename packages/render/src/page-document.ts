import {
  type Book,
  type FontFace,
  type FontFailure,
  type FontManifest,
  type FontReference,
  type FontSource,
  type Page,
  type PageOrPrintedInput,
  pageDirection,
  persistedFontManifestWithReferences,
  resolveLimits,
  resolvePageWidth,
} from '@segnavia/format'
import { frameDocument, frameStyleSheets, newNonce, StyleSheetRefusedError } from '@segnavia/frame/bridge'
import { hasDiagram, withDiagramScript } from '@segnavia/frame/diagrams'
import { FontRefusedError, fontManifestReferences, refuseMissingFontSource, resolveFontReferences } from '@segnavia/frame/fonts'
import { expandFramePage, type MotifsOptions } from '@segnavia/frame/motifs'
import { FontCssRefusedError, type HtmlPage, pageOrPrintedFromInput, resolvePageHtml } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'
import { fontFaces } from './font-faces.ts'
import { localFontsForRender } from './local-fonts.ts'
import type { RenderOptions } from './options.ts'
import { containFixedPageOverflow } from './overflow-containment.ts'
import { printCss } from './page-paper.ts'
import { RENDER_READY_BINDING } from './render-readiness.ts'

export async function fontCssForRender<T>(work: Promise<T>): Promise<T> {
  try {
    return await work
  } catch (error) {
    if (error instanceof FontCssRefusedError || error instanceof FontRefusedError) throw new RenderRefusedError(error.message)
    throw error
  }
}

async function resolveRenderFontReferences(
  declarations: FontManifest,
  source: FontSource | undefined,
  local: FontFace[],
  signal: AbortSignal,
  place: string,
): Promise<{ css: string; failures: FontFailure[] }> {
  if (!source) {
    refuseMissingFontSource(declarations, place)
    return { css: '', failures: [] }
  }
  return resolveFontReferences(declarations, { source, local }, signal, place)
}

export async function prepareRenderedPage(
  input: PageOrPrintedInput,
  options: RenderOptions,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  purpose: 'screen' | 'print' = 'print',
) {
  return prepareRenderedPageValue(pageOrPrintedFromInput(input, { newId: options.newId }), options, motifs, signal, purpose)
}

export async function prepareRenderedPageValue(
  input: Page,
  options: RenderOptions,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  purpose: 'screen' | 'print' = 'print',
) {
  const page = resolvePageHtml(input)
  const expanded = await expandFramePage(page, motifs, signal, options.placements, purpose, options.pageWidths)
  const declarations = persistedFontManifestWithReferences(expanded.page.style?.fonts, expanded.fonts)
  const references = fontManifestReferences(declarations)
  const local = localFontsForRender(options.localFonts, references, resolveLimits(undefined, options.limits).localFonts)
  const place = expanded.page.id ? `page ${JSON.stringify(expanded.page.id)}` : 'page'
  const resolved = await fontCssForRender(resolveRenderFontReferences(declarations, options.fontSource, local.faces, signal, place))
  options.localFonts?.report?.(local.report)
  return { page: expanded.page, options, fontCss: resolved.css, fontFailures: resolved.failures }
}

export async function prepareRenderedPages(
  expanded: ReadonlyArray<{ page: Pick<Page, 'style'>; fonts: FontReference[] }>,
  options: RenderOptions,
  signal: AbortSignal,
): Promise<{ options: RenderOptions; fontCss: string; fontFailures: FontFailure[] }> {
  let declarations: FontManifest = {}
  for (const item of expanded) declarations = persistedFontManifestWithReferences({ ...declarations, ...item.page.style?.fonts }, item.fonts)
  const references = fontManifestReferences(declarations)
  const local = localFontsForRender(options.localFonts, references, resolveLimits(undefined, options.limits).localFonts)
  const resolved = await fontCssForRender(resolveRenderFontReferences(declarations, options.fontSource, local.faces, signal, 'page'))
  options.localFonts?.report?.(local.report)
  return { options, fontCss: resolved.css, fontFailures: resolved.failures }
}

export async function renderOptionsWithBookFonts(
  book: Book,
  options: RenderOptions,
  signal: AbortSignal,
  motifFonts: FontReference[] = [],
): Promise<{ options: RenderOptions; fontCss: string; fontFailures: FontFailure[] }> {
  const place = `book ${JSON.stringify(book.title)}`
  const declarations = persistedFontManifestWithReferences(book.style?.fonts, motifFonts)
  const references = fontManifestReferences(declarations)
  const local = localFontsForRender(options.localFonts, references, resolveLimits(undefined, options.limits).localFonts)
  const resolved = await fontCssForRender(resolveRenderFontReferences(declarations, options.fontSource, local.faces, signal, place))
  options.localFonts?.report?.(local.report)
  return { options, fontCss: resolved.css, fontFailures: resolved.failures }
}

interface ResolvedPageDocumentOptions extends Pick<RenderOptions, 'dependencyOrigins' | 'css'> {
  diagramScript?: string
  nonce?: string
  relayKeys?: boolean
  reportHeight?: boolean
  fontFailures?: FontFailure[]
}

export function resolvedPageDocument(page: HtmlPage, baseCss: string, options: ResolvedPageDocumentOptions): string {
  const nonce = options.nonce ?? newNonce()
  let sheets: string[]
  try {
    sheets = frameStyleSheets(page.style, baseCss)
  } catch (error) {
    if (error instanceof StyleSheetRefusedError) throw new RenderRefusedError(error.message)
    throw error
  }
  return frameDocument(withDiagramScript(page.html, nonce, options.diagramScript), {
    scripts: page.scripts,
    nonce,
    dir: pageDirection(page),
    lang: page.lang,
    fonts: page.style?.fonts,
    fontFailures: options.fontFailures,
    sheets,
    css: options.css,
    relayKeys: options.relayKeys ?? false,
    reportHeight: options.reportHeight ?? false,
    dependencyOrigins: options.dependencyOrigins,
    readyCallback: hasDiagram(page.html) ? RENDER_READY_BINDING : undefined,
  })
}

export function renderPageDocument(
  input: PageOrPrintedInput,
  options: RenderOptions,
  printing = false,
  nonce?: string,
  fontCss = '',
  diagramScript?: string,
): string {
  return renderPageValueDocument(pageOrPrintedFromInput(input, { newId: options.newId }), options, printing, nonce, fontCss, diagramScript)
}

export function renderPageValueDocument(
  input: Page | HtmlPage,
  options: RenderOptions,
  printing = false,
  nonce?: string,
  fontCss = '',
  diagramScript?: string,
  fontFailures: FontFailure[] = [],
): string {
  const page = 'html' in input ? input : resolvePageHtml(input)
  const namedMeasure =
    page.print && page.size.height === 'auto' && (page.size.width === 'standard' || page.size.width === 'wide')
      ? resolvePageWidth(page.size, options.pageWidths).measure
      : undefined
  const measureCss = namedMeasure === undefined ? '' : `:where(body){max-inline-size:${namedMeasure}px;margin-inline:auto}`
  const baseCss = `${page.print ? printCss(page.print, pageDirection(page)) : ''}${measureCss}${fontCss}${fontFaces(options.fonts)}`
  const fixedSize = typeof page.size === 'object' && page.size.height !== 'auto'
  const css = printing && !page.print && fixedSize ? containFixedPageOverflow(baseCss) : baseCss
  return resolvedPageDocument(page, css, {
    css: options.css,
    dependencyOrigins: options.dependencyOrigins,
    diagramScript,
    nonce,
    relayKeys: false,
    reportHeight: false,
    fontFailures,
  })
}
