import { parseBookPdfOptions } from '../book-options.ts'
import { directoryFontSource } from '../directory-font-source.ts'
import { parseDeckPdfOptions } from '../entry-options.ts'
import { type InputRefusal, RenderRefusedError } from '../errors.ts'
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
type AtomicFunctionPath = 'fontSource' | 'brandSource' | 'motifs.source'
type JoinedPath<Prefix extends string, Key extends string> = Prefix extends '' ? Key : `${Prefix}.${Key}`
type FunctionPathForValue<Value, Path extends string> = Value extends null | undefined
  ? never
  : Path extends AtomicFunctionPath
    ? Path
    : Value extends AnyFunction
      ? Path
      : Value extends readonly unknown[] | ArrayBufferView
        ? never
        : Value extends object
          ? NestedFunctionPath<Value, Path>
          : never
type NestedFunctionPath<T, Prefix extends string = ''> = T extends unknown
  ? {
      [Key in keyof T & string]-?: FunctionPathForValue<T[Key], JoinedPath<Prefix, Key>>
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
  'anchors.resolve': true,
  'skipRefused.report': true,
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

function cliOptions(request: RenderRequest, environment: RenderEnvironment, refusedInputs: InputRefusal[]): Record<string, unknown> {
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
  const options =
    request.render === 'pages' && request.options.skipRefused === true
      ? { ...request.options, skipRefused: { report: (entries: readonly InputRefusal[]) => refusedInputs.push(...entries) } }
      : request.options
  return request.fonts ? { ...options, fontSource: directoryFontSource(request.fonts, { root: environment.SEGNAVIA_FONTS as string }) } : options
}

function refusedLine(entries: readonly InputRefusal[]): string {
  return `${JSON.stringify({
    refused: entries.map(({ index, id, error }) => ({
      index,
      ...(id === undefined ? {} : { id }),
      refusal: { code: error.code, subject: error.subject ?? null, message: error.message, refusals: error.refusals },
    })),
  })}\n`
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
    const refusedInputs: InputRefusal[] = []
    const options = cliOptions(request, environment, refusedInputs)
    const renderer = await open({
      executablePath: environment.SEGNAVIA_CHROMIUM,
      ...(environment.SEGNAVIA_CHROMIUM_CONTAINER === '1' ? { args: CONTAINER_ARGS } : {}),
    })
    try {
      const stdout = await renderRequest(renderer, request, options)
      try {
        await renderer.close()
      } catch {}
      return { exitCode: 0, stdout, stderr: refusedInputs.length === 0 ? '' : refusedLine(refusedInputs) }
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
