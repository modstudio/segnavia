import { parseBookPdfOptions } from '../book-options.ts'
import { directoryFontSource } from '../directory-font-source.ts'
import { parseDeckPdfOptions } from '../entry-options.ts'
import { RenderRefusedError } from '../errors.ts'
import { parsePagePdfOptions } from '../page-render-options.ts'
import { type BookPdfOptions, CONTAINER_ARGS, type DeckPdfInputOptions, type PagePdfOptions, type PagesPdfInputOptions, type Renderer } from '../renderer.ts'
import { outcomeFromError, parseRenderRequest, type RenderOutcome, type RenderRequest } from './protocol.ts'

export interface RenderEnvironment {
  SEGNAVIA_CHROMIUM?: string
  SEGNAVIA_CHROMIUM_CONTAINER?: string
  SEGNAVIA_FONTS?: string
}

export type OpenRenderer = (options: { executablePath: string; args?: string[] }) => Promise<Renderer>

type AnyFunction = (...args: never[]) => unknown
type AtomicFunctionOption =
  | NonNullable<PagePdfOptions['fontSource']>
  | NonNullable<PagePdfOptions['brandSource']>
  | NonNullable<NonNullable<PagePdfOptions['motifs']>['source']>
type FunctionPathForValue<Value, Key extends string> = Value extends unknown
  ? NonNullable<Value> extends AnyFunction
    ? Key
    : NonNullable<Value> extends AtomicFunctionOption
      ? Key
      : NonNullable<Value> extends readonly unknown[] | ArrayBufferView
        ? never
        : NonNullable<Value> extends object
          ? `${Key}.${NestedFunctionPath<NonNullable<Value>>}`
          : never
  : never
type NestedFunctionPath<T> = T extends unknown
  ? {
      [Key in keyof T & string]-?: FunctionPathForValue<T[Key], Key>
    }[keyof T & string]
  : never
type CliFunctionOptionPath = NestedFunctionPath<PagePdfOptions | PagesPdfInputOptions | BookPdfOptions | DeckPdfInputOptions>

const FUNCTION_OPTIONS = {
  newId: true,
  assets: true,
  fontSource: true,
  brandSource: true,
  'fontLoad.report': true,
  'progress.report': true,
  beforeOutput: true,
  'slots.resolve': true,
  'slots.resolveAsset': true,
  'slots.report': true,
  'placements.resolve': true,
  'placements.report': true,
  'effects.report': true,
  'overflow.report': true,
  'marks.report': true,
  'press.report': true,
  'localFonts.report': true,
  'preflight.report': true,
  'motifs.source': true,
  'motifs.placed': true,
  'asOf.report': true,
  inline: true,
} satisfies Record<CliFunctionOptionPath, true>

function functionOptionPath(value: unknown, path: string[] = []): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  for (const [key, child] of Object.entries(value)) {
    const next = [...path, key]
    const optionPath = next.join('.')
    if (optionPath in FUNCTION_OPTIONS) return optionPath
    const nested = functionOptionPath(child, next)
    if (nested) return nested
  }
  return undefined
}

function cliOptions(request: RenderRequest, environment: RenderEnvironment): Record<string, unknown> {
  const refused = functionOptionPath(request.options)
  if (refused)
    throw new RenderRefusedError(`The command-line render option ${refused} requires a function; remove it to clear this refusal.`, {
      code: 'render-request',
      subject: `options.${refused}`,
    })
  if (request.fonts && !environment.SEGNAVIA_FONTS)
    throw new RenderRefusedError('The fonts catalog requires SEGNAVIA_FONTS; set it to the catalog root to clear this refusal.', {
      code: 'render-request',
      subject: 'SEGNAVIA_FONTS',
    })
  return request.fonts
    ? { ...request.options, fontSource: directoryFontSource(request.fonts, { root: environment.SEGNAVIA_FONTS as string }) }
    : request.options
}

function renderRequest(renderer: Renderer, request: RenderRequest, options: Record<string, unknown>): Promise<Uint8Array> {
  switch (request.render) {
    case 'page':
      return renderer.pagePdf(request.document as never, parsePagePdfOptions(options as never, 'pagePdf'))
    case 'pages':
      return renderer.pagesPdf(request.document as never[], parsePagePdfOptions(options as never, 'pagesPdf'))
    case 'book':
      return renderer.bookPdf(request.document as never, parseBookPdfOptions(options as never))
    case 'deck':
      return renderer.deckPdf(request.document as never, parseDeckPdfOptions(options as never))
  }
}

export async function runRenderRequest(input: Uint8Array, environment: RenderEnvironment, open: OpenRenderer, inputLimit?: number): Promise<RenderOutcome> {
  try {
    const request = parseRenderRequest(input, inputLimit)
    if (!environment.SEGNAVIA_CHROMIUM)
      throw new RenderRefusedError('SEGNAVIA_CHROMIUM is missing; set it to the Chromium executable to clear this refusal.', {
        code: 'render-request',
        subject: 'SEGNAVIA_CHROMIUM',
      })
    const options = cliOptions(request, environment)
    const renderer = await open({
      executablePath: environment.SEGNAVIA_CHROMIUM,
      ...(environment.SEGNAVIA_CHROMIUM_CONTAINER === '1' ? { args: CONTAINER_ARGS } : {}),
    })
    try {
      const stdout = await renderRequest(renderer, request, options)
      try {
        await renderer.close()
      } catch {}
      return { exitCode: 0, stdout, stderr: '' }
    } catch (error) {
      try {
        await renderer.close()
      } catch {}
      throw error
    }
  } catch (error) {
    return outcomeFromError(error)
  }
}
