import {
  Book,
  type BookInput,
  type FontFace,
  type FontReference,
  type FontSource,
  htmlTextSample,
  type PageInput,
  type Page,
  resolveDirection,
  resolveLimits,
  resolvePageWidth,
} from '@segnavia/format'
import { frameDocument, newNonce } from '@segnavia/frame/bridge'
import { hasDiagram, withDiagramScript } from '@segnavia/frame/diagrams'
import { FontRefusedError, refuseMissingFontSource, resolveFontReferences, uniqueFontReferences } from '@segnavia/frame/fonts'
import { expandFramePage, type MotifsOptions } from '@segnavia/frame/motifs'
import { FontCssRefusedError, type HtmlPage, resolvePageHtml } from '@segnavia/html'
import { type PageOrPrintedInput, pageOrPrintedFromInput } from './document-input.ts'
import { RenderRefusedError } from './errors.ts'
import { fontFaces } from './font-faces.ts'
import { localFontsForRender } from './local-fonts.ts'
import type { RenderOptions } from './options.ts'
import { containFixedPageOverflow } from './overflow-containment.ts'
import { printCss } from './page-paper.ts'
import { RENDER_READY_BINDING } from './render-readiness.ts'

export function withFontCss(options: RenderOptions, css: string): RenderOptions {
  return { ...options, css: `${css}${options.css ?? ''}` }
}

export async function fontCssForRender<T>(work: Promise<T>): Promise<T> {
  try {
    return await work
  } catch (error) {
    if (error instanceof FontCssRefusedError || error instanceof FontRefusedError) throw new RenderRefusedError(error.message)
    throw error
  }
}

async function resolveRenderFontReferences(
  references: FontReference[],
  source: FontSource | undefined,
  local: FontFace[],
  signal: AbortSignal,
  place: string,
): Promise<string> {
  if (!source) {
    refuseMissingFontSource(references, place)
    return ''
  }
  return resolveFontReferences(references, { source, local }, signal, place)
}

export async function prepareRenderedPage(
  input: PageOrPrintedInput,
  options: RenderOptions,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  purpose: 'screen' | 'print' = 'print',
) {
  return prepareRenderedPageValue(pageOrPrintedFromInput(input), options, motifs, signal, purpose)
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
  const references = uniqueFontReferences([...(expanded.page.fonts ?? []), ...expanded.fonts])
  const local = localFontsForRender(options.localFonts, references, resolveLimits(undefined, options.limits).localFonts)
  const place = expanded.page.id ? `page ${JSON.stringify(expanded.page.id)}` : 'page'
  const css = await fontCssForRender(resolveRenderFontReferences(references, options.fontSource, local.faces, signal, place))
  options.localFonts?.report?.(local.report)
  return { page: expanded.page, options: withFontCss(options, css) }
}

export async function prepareRenderedPages(
  expanded: ReadonlyArray<{ page: Pick<PageInput, 'fonts'>; fonts: FontReference[] }>,
  options: RenderOptions,
  signal: AbortSignal,
): Promise<RenderOptions> {
  const references = uniqueFontReferences([...expanded.flatMap((item) => item.page.fonts ?? []), ...expanded.flatMap((item) => item.fonts)])
  const local = localFontsForRender(options.localFonts, references, resolveLimits(undefined, options.limits).localFonts)
  const css = await fontCssForRender(resolveRenderFontReferences(references, options.fontSource, local.faces, signal, 'page'))
  options.localFonts?.report?.(local.report)
  return withFontCss(options, css)
}

export async function renderOptionsWithBookFonts(
  input: Book | BookInput,
  options: RenderOptions,
  signal: AbortSignal,
  motifFonts: FontReference[] = [],
): Promise<{ options: RenderOptions; fontCss: string }> {
  const book = 'body' in input ? input : Book.parse(input)
  const place = `book ${JSON.stringify(book.title)}`
  const references = uniqueFontReferences([...(book.fonts ?? []), ...motifFonts])
  const local = localFontsForRender(options.localFonts, references, resolveLimits(undefined, options.limits).localFonts)
  const css = await fontCssForRender(resolveRenderFontReferences(references, options.fontSource, local.faces, signal, place))
  options.localFonts?.report?.(local.report)
  return { options, fontCss: css }
}

interface ResolvedPageDocumentOptions extends Pick<RenderOptions, 'dependencyOrigins'> {
  diagramScript?: string
  nonce?: string
  relayKeys?: boolean
  reportHeight?: boolean
}

export function resolvedPageDocument(page: HtmlPage, css: string, options: ResolvedPageDocumentOptions): string {
  const nonce = options.nonce ?? newNonce()
  return frameDocument(withDiagramScript(page.html, nonce, options.diagramScript), {
    scripts: page.scripts,
    nonce,
    dir: page.dir,
    lang: page.lang,
    css,
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
  return renderPageValueDocument(pageOrPrintedFromInput(input), options, printing, nonce, fontCss, diagramScript)
}

export function renderPageValueDocument(
  input: Page,
  options: RenderOptions,
  printing = false,
  nonce?: string,
  fontCss = '',
  diagramScript?: string,
): string {
  const page = resolvePageHtml(input)
  const namedMeasure =
    page.print && page.size.height === 'auto' && (page.size.width === 'standard' || page.size.width === 'wide')
      ? resolvePageWidth(page.size, options.pageWidths).measure
      : undefined
  const measureCss = namedMeasure === undefined ? '' : `:where(body){max-inline-size:${namedMeasure}px;margin-inline:auto}`
  const hostCss = `${page.print ? printCss(page.print, resolveDirection(page.dir, page.lang, htmlTextSample(page.html))) : ''}${measureCss}${fontCss}${fontFaces(options.fonts)}${options.css ?? ''}`
  const fixedSize = typeof page.size === 'object' && page.size.height !== 'auto'
  const css = printing && !page.print && fixedSize ? containFixedPageOverflow(hostCss) : hostCss
  return resolvedPageDocument(page, css, { dependencyOrigins: options.dependencyOrigins, diagramScript, nonce, relayKeys: false, reportHeight: false })
}
