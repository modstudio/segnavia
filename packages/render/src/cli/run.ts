import { CONTAINER_ARGS, type Renderer } from '../renderer.ts'
import { directoryFontSource } from '../directory-font-source.ts'
import { parseBookPdfOptions } from '../book-options.ts'
import { parseDeckPdfOptions } from '../entry-options.ts'
import { RenderRefusedError } from '../errors.ts'
import { parsePagePdfOptions } from '../page-render-options.ts'
import { outcomeFromError, parseRenderRequest, type RenderOutcome, type RenderRequest } from './protocol.ts'

export interface RenderEnvironment {
  SEGNAVIA_CHROMIUM?: string
  SEGNAVIA_CHROMIUM_CONTAINER?: string
  SEGNAVIA_FONTS?: string
}

export type OpenRenderer = (options: { executablePath: string; args?: string[] }) => Promise<Renderer>

const FUNCTION_OPTIONS = new Set(['assets', 'fontSource', 'brandSource', 'newId', 'inline', 'beforeOutput'])

function functionOptionPath(value: unknown, path: string[] = []): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  for (const [key, child] of Object.entries(value)) {
    const next = [...path, key]
    if (FUNCTION_OPTIONS.has(key) || key === 'report' || (key === 'resolve' && path.at(-1) === 'placements')) return next.join('.')
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

export async function runRenderRequest(
  input: Uint8Array,
  environment: RenderEnvironment,
  open: OpenRenderer,
  inputLimit?: number,
): Promise<RenderOutcome> {
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
      return { exitCode: 0, stdout: await renderRequest(renderer, request, options), stderr: '' }
    } finally {
      await renderer.close()
    }
  } catch (error) {
    return outcomeFromError(error)
  }
}
