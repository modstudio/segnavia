import { DEFAULT_LIMITS, FontCatalog, isLimitExceeded, type Refusal, Refusal as RefusalError } from '@segnavia/format'

export const RENDER_REQUEST_BYTES = DEFAULT_LIMITS.input.bytes

export type RenderKind = 'page' | 'pages' | 'book' | 'deck'

export interface RenderRequest {
  render: RenderKind
  document: unknown
  options: Record<string, unknown>
  fonts?: FontCatalog
}

export interface RenderOutcome {
  exitCode: 0 | 1 | 2
  stdout: Uint8Array
  stderr: string
}

export class RenderRequestRefusal extends RefusalError {
  override name = 'RenderRequestRefusal'

  constructor(message: string, subject?: string) {
    super('render-request', message, { subject })
  }
}

export function stdinBoundRefusal(limit: number): RenderRequestRefusal {
  return new RenderRequestRefusal(`The stdin request exceeds the ${limit}-byte bound; send a smaller request to clear this refusal.`, 'stdin')
}

function requestObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RenderRequestRefusal('The render request must be a JSON object; send an object to clear this refusal.', 'request')
  return value as Record<string, unknown>
}

function parseRender(value: unknown): RenderKind {
  if (value === 'page' || value === 'pages' || value === 'book' || value === 'deck') return value
  throw new RenderRequestRefusal('The render request has an unknown render value; use page, pages, book or deck to clear this refusal.', 'render')
}

function parseOptions(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RenderRequestRefusal('The render request options must be a JSON object; send an options object to clear this refusal.', 'options')
  return value as Record<string, unknown>
}

function parseFonts(value: unknown): FontCatalog | undefined {
  if (value === undefined) return undefined
  const parsed = FontCatalog.safeParse(value)
  if (parsed.success) return parsed.data
  throw new RenderRequestRefusal('The render request fonts are not a FontCatalog; send a valid catalog to clear this refusal.', 'fonts')
}

export function parseRenderRequest(input: Uint8Array, limit = RENDER_REQUEST_BYTES): RenderRequest {
  if (input.byteLength > limit) throw stdinBoundRefusal(limit)
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(input))
  } catch {
    throw new RenderRequestRefusal('The stdin request is not valid JSON; send one valid JSON request to clear this refusal.', 'stdin')
  }
  const source = requestObject(value)
  const unknown = Object.keys(source).filter((key) => !['render', 'document', 'options', 'fonts'].includes(key))
  if (unknown.length > 0)
    throw new RenderRequestRefusal(`The render request has unknown field ${JSON.stringify(unknown[0])}; remove it to clear this refusal.`, unknown[0])
  if (!Object.hasOwn(source, 'document'))
    throw new RenderRequestRefusal('The render request has no document; send the document to clear this refusal.', 'document')
  const render = parseRender(source.render)
  if (render === 'pages' && !Array.isArray(source.document))
    throw new RenderRequestRefusal('The pages render document must be an array; send an array of pages to clear this refusal.', 'document')
  return {
    render,
    document: source.document,
    options: parseOptions(source.options),
    ...(source.fonts === undefined ? {} : { fonts: parseFonts(source.fonts) }),
  }
}

function errorRecord(error: unknown): { name: string; message: string } {
  return error instanceof Error ? { name: error.name, message: error.message } : { name: 'Error', message: String(error) }
}

export function outcomeFromError(error: unknown): RenderOutcome {
  if (error instanceof RefusalError) {
    const refusal = error as Refusal
    return {
      exitCode: 2,
      stdout: new Uint8Array(),
      stderr: `${JSON.stringify({
        refusal: {
          name: error.name,
          code: refusal.code,
          subject: refusal.subject ?? null,
          message: error.message,
          refusals: refusal.refusals.map((cause) => ({ code: cause.code, subject: cause.subject ?? null, message: cause.message })),
        },
      })}\n`,
    }
  }
  if (isLimitExceeded(error)) {
    return {
      exitCode: 2,
      stdout: new Uint8Array(),
      stderr: `${JSON.stringify({
        refusal: {
          name: error.name,
          code: 'limit',
          subject: error.exceeded[0]?.measure ?? null,
          message: error.message,
          refusals: error.exceeded.map((cause) => ({ code: 'limit', subject: cause.measure, message: cause.message })),
        },
      })}\n`,
    }
  }
  return { exitCode: 1, stdout: new Uint8Array(), stderr: `${JSON.stringify({ failure: errorRecord(error) })}\n` }
}
