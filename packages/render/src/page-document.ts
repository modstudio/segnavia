import {
  type AsOfDay,
  type Book,
  type FontFace,
  type FontFailure,
  type FontManifest,
  type FontReference,
  type FontSource,
  fontManifestWithReferences,
  type Page,
  type PageOrPrintedInput,
  type PreflightEntry,
  pageDirection,
  pageOrPrintedFromDocument,
  resolveLimits,
  resolvePageWidth,
} from '@segnavia/format'
import { frameDocument, frameStyleSheets, newNonce, StyleSheetRefusedError } from '@segnavia/frame/bridge'
import { hasDiagram, withDiagramScript } from '@segnavia/frame/diagrams'
import { FontRefusedError, fontManifestReferences, refuseMissingFontSource, resolveFontReferences } from '@segnavia/frame/fonts'
import type { LoadedLayoutScript } from '@segnavia/frame/layout'
import { expandFramePage, expandPrintedFramePage, type MotifsOptions } from '@segnavia/frame/motifs'
import {
  type EstablishedPageDay,
  FontCssRefusedError,
  type HtmlPage,
  type PrintedHtmlPage,
  parseDocument,
  resolvePageHtml,
  resolvePrintedPageHtml,
} from '@segnavia/html'
import { resolveRenderBrand } from './brand.ts'
import { RenderRefusedError } from './errors.ts'
import { fontFaces } from './font-faces.ts'
import { localFontsForRender } from './local-fonts.ts'
import type { ComposedRenderOptions, ParsedPageRenderOptions, RenderOptions } from './options.ts'
import { containFixedPageOverflow } from './overflow-containment.ts'
import { resolveRenderDayContext } from './page-as-of.ts'
import { printCss } from './page-paper.ts'
import { withPreflightSeed } from './preflight.ts'
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
  undeclared: readonly string[],
  source: FontSource | undefined,
  local: FontFace[],
  signal: AbortSignal,
  place: string,
): Promise<{ css: string; failures: FontFailure[] }> {
  if (!source) {
    refuseMissingFontSource(declarations, undeclared, place)
    return { css: '', failures: [] }
  }
  return resolveFontReferences(declarations, undeclared, { source, local }, signal, place)
}

export async function prepareRenderedPage(
  input: PageOrPrintedInput,
  options: ParsedPageRenderOptions,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  purpose: 'screen' | 'print' = 'print',
) {
  const document = parseDocument(input, { newId: options.newId })
  const brand = await resolveRenderBrand(document, options.brandSource, signal)
  const page = pageOrPrintedFromDocument(document, brand)
  const established = await resolveRenderDayContext(page, options, signal)
  const prepared = page.printedPages?.sections
    ? await prepareRenderedPrintedPageValue(page, options, motifs, signal, established, purpose)
    : await prepareRenderedPageValue(page, options, motifs, signal, established, purpose)
  return prepared
}

export async function prepareRenderedPageValue(
  input: Page,
  options: ComposedRenderOptions,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  established: EstablishedPageDay,
  purpose: 'screen' | 'print' = 'print',
) {
  const page = resolvePageHtml(input, { origins: options.origins })
  const expanded = await expandFramePage(page, motifs, signal, options.placements, purpose, options.pageWidths, established.day, options.preflight?.profile)
  return preparedRender(expanded, options, signal, established)
}

export function expandRenderedPageValue(
  page: Page,
  options: ComposedRenderOptions & { motifs?: MotifsOptions },
  signal: AbortSignal,
  day: AsOfDay | undefined,
  purpose: 'screen' | 'print',
) {
  return page.printedPages?.sections
    ? expandPrintedFramePage(
        resolvePrintedPageHtml(page),
        options.motifs,
        signal,
        options.placements,
        purpose,
        options.pageWidths,
        day,
        options.preflight?.profile,
      )
    : expandFramePage(
        resolvePageHtml(page, { origins: options.origins }),
        options.motifs,
        signal,
        options.placements,
        purpose,
        options.pageWidths,
        day,
        options.preflight?.profile,
      )
}

async function prepareRenderedPrintedPageValue(
  input: Page,
  options: ComposedRenderOptions,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  established: EstablishedPageDay,
  purpose: 'screen' | 'print',
) {
  const expanded = await expandPrintedFramePage(
    resolvePrintedPageHtml(input),
    motifs,
    signal,
    options.placements,
    purpose,
    options.pageWidths,
    established.day,
    options.preflight?.profile,
  )
  return preparedRender(expanded, options, signal, established)
}

async function preparedRender<T extends HtmlPage | PrintedHtmlPage>(
  expanded: { page: T; fonts: FontReference[]; preflight?: PreflightEntry[] },
  options: ComposedRenderOptions,
  signal: AbortSignal,
  established: EstablishedPageDay,
) {
  const { manifest, undeclared } = fontManifestWithReferences(expanded.page.style?.fonts, expanded.fonts)
  const resolvedReferences = fontManifestReferences(manifest, undeclared)
  const local = localFontsForRender(options.localFonts, resolvedReferences, resolveLimits(undefined, options.limits).localFonts)
  const place = expanded.page.id ? `page ${JSON.stringify(expanded.page.id)}` : 'page'
  const resolved = await fontCssForRender(resolveRenderFontReferences(manifest, undeclared, options.fontSource, local.faces, signal, place))
  options.localFonts?.report?.(local.report)
  return {
    page: expanded.page,
    options: { ...options, preflight: withPreflightSeed(options.preflight, expanded.preflight) },
    fontCss: resolved.css,
    fontFailures: resolved.failures,
    established,
  }
}

export async function prepareRenderedPages(
  expanded: ReadonlyArray<{ page: Pick<Page, 'style'>; fonts: FontReference[] }>,
  options: ComposedRenderOptions,
  signal: AbortSignal,
): Promise<{ options: ComposedRenderOptions; fontCss: string; fontFailures: FontFailure[] }> {
  let declarations: FontManifest = {}
  const undeclared = new Set<string>()
  for (const item of expanded) {
    const merged = fontManifestWithReferences({ ...declarations, ...item.page.style?.fonts }, item.fonts)
    declarations = merged.manifest
    for (const name of merged.undeclared) undeclared.add(name)
  }
  for (const name of Object.keys(declarations)) undeclared.delete(name)
  const references = fontManifestReferences(declarations, [...undeclared])
  const local = localFontsForRender(options.localFonts, references, resolveLimits(undefined, options.limits).localFonts)
  const resolved = await fontCssForRender(resolveRenderFontReferences(declarations, [...undeclared], options.fontSource, local.faces, signal, 'page'))
  options.localFonts?.report?.(local.report)
  return { options, fontCss: resolved.css, fontFailures: resolved.failures }
}

export async function renderOptionsWithBookFonts(
  book: Book,
  options: ComposedRenderOptions,
  signal: AbortSignal,
  motifFonts: FontReference[] = [],
): Promise<{ options: ComposedRenderOptions; fontCss: string; fontFailures: FontFailure[] }> {
  const place = `book ${JSON.stringify(book.title)}`
  return renderOptionsWithFontManifest(book.style?.fonts, motifFonts, place, options, signal)
}

export async function renderOptionsWithFontManifest(
  fonts: FontManifest | undefined,
  references: FontReference[],
  place: string,
  options: ComposedRenderOptions,
  signal: AbortSignal,
): Promise<{ options: ComposedRenderOptions; fontCss: string; fontFailures: FontFailure[] }> {
  const { manifest, undeclared } = fontManifestWithReferences(fonts, references)
  const resolvedReferences = fontManifestReferences(manifest, undeclared)
  const local = localFontsForRender(options.localFonts, resolvedReferences, resolveLimits(undefined, options.limits).localFonts)
  const resolved = await fontCssForRender(resolveRenderFontReferences(manifest, undeclared, options.fontSource, local.faces, signal, place))
  options.localFonts?.report?.(local.report)
  return { options, fontCss: resolved.css, fontFailures: resolved.failures }
}

interface ResolvedPageDocumentOptions extends Pick<RenderOptions, 'origins' | 'css'> {
  diagramScript?: string
  layoutScripts?: readonly LoadedLayoutScript[]
  nonce?: string
  relayKeys?: boolean
  reportHeight?: boolean
  fontFailures?: FontFailure[]
}

export function resolvedPageDocument(page: HtmlPage, baseCss: string, options: ResolvedPageDocumentOptions): string {
  const nonce = options.nonce ?? newNonce()
  let sheets: string[]
  try {
    sheets = frameStyleSheets(page.style, page.brand, baseCss)
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
    origins: options.origins,
    readyCallback: hasDiagram(page.html) || (options.layoutScripts?.length ?? 0) > 0 ? RENDER_READY_BINDING : undefined,
    layoutScripts: options.layoutScripts,
  })
}

export function renderPageValueDocument(
  input: Page | HtmlPage,
  options: RenderOptions,
  printing = false,
  nonce?: string,
  fontCss = '',
  diagramScript?: string,
  fontFailures: FontFailure[] = [],
  layoutScripts?: readonly LoadedLayoutScript[],
): string {
  const page = 'html' in input ? input : resolvePageHtml(input, { origins: options.origins })
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
    origins: options.origins,
    diagramScript,
    nonce,
    relayKeys: false,
    reportHeight: false,
    fontFailures,
    layoutScripts,
  })
}
