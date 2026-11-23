import {
  isLimitExceeded,
  type LimitExceeded,
  LimitExceededError,
  type LimitMeasure,
  type LimitRefusalOptions,
  Refusal,
  type RefusalOptions,
} from '@segnavia/format'
import { ProfileUnsupportedError } from './color/types.ts'

export class RendererUnavailableError extends Error {
  override name = 'RendererUnavailableError'
}

export function launchUnavailable(executablePath: string, error: unknown): RendererUnavailableError {
  return new RendererUnavailableError(`Chromium at ${executablePath} could not start: ${(error as Error).message}`)
}

export function relaunchUnavailable(executablePath: string, error: unknown): RendererUnavailableError {
  if (error instanceof RendererUnavailableError) return error
  return new RendererUnavailableError(`Chromium at ${executablePath} exited and could not be relaunched: ${(error as Error).message}`)
}

export function rendererClosed(): RendererUnavailableError {
  return new RendererUnavailableError('The renderer is closed; open a new one.')
}

export function browserExited(): RendererUnavailableError {
  return new RendererUnavailableError("The renderer's browser exited during the render; the next render relaunches it.")
}

// A render that produced something the host's limits refuse, a page that never
// said it was ready, or a page that crashed. The message names which.
export class RenderRefusedError extends Refusal {
  override name = 'RenderRefusedError'

  constructor(message: string, options: RefusalOptions & { code?: string } = {}) {
    super(options.code ?? 'render', message, options)
  }
}

export interface InputRefusal {
  index: number
  id?: string
  error: Refusal | (Error & { readonly exceeded: readonly LimitExceeded[] })
}

function inputName(entry: Pick<InputRefusal, 'index' | 'id'>): string {
  return `input ${entry.index + 1}${entry.id === undefined ? '' : ` (${entry.id})`}`
}

export class RenderInputsRefusedError extends RenderRefusedError {
  override name = 'RenderInputsRefusedError'
  readonly entries: readonly InputRefusal[]
  readonly exceeded: readonly LimitExceeded[]

  constructor(entries: readonly InputRefusal[]) {
    super(
      entries.length === 0
        ? 'No render inputs were supplied; pass at least one input to clear this refusal.'
        : `Inputs were refused: ${entries.map((entry) => `${inputName(entry)}: ${entry.error.message}`).join('; ')}`,
      {
        code: 'render-inputs',
        refusals: entries.map((entry) => ({
          code: entry.error instanceof Refusal ? entry.error.code : 'limit',
          subject: `input ${entry.index + 1}`,
          message: `${inputName(entry)}: ${entry.error.message}`,
        })),
      },
    )
    this.entries = entries
    this.exceeded = entries.flatMap((entry) => (isLimitExceeded(entry.error) ? entry.error.exceeded : []))
  }
}

export class ReceivedPdfError extends RenderRefusedError {
  override name = 'ReceivedPdfError'
  readonly reason: 'encrypted' | 'unreadable' | 'too-large'

  constructor(reason: 'encrypted' | 'unreadable' | 'too-large', message: string) {
    super(message)
    this.reason = reason
  }
}
export class RenderLimitError extends RenderRefusedError {
  override name = 'RenderLimitError'
  readonly exceeded: readonly LimitExceeded[]

  constructor(measure: LimitMeasure, actual: number, limit: number, options?: LimitRefusalOptions)
  constructor(exceeded: readonly [LimitExceeded, ...LimitExceeded[]], message?: string)
  constructor(
    measureOrExceeded: LimitMeasure | readonly [LimitExceeded, ...LimitExceeded[]],
    actualOrMessage?: number | string,
    limit?: number,
    options: LimitRefusalOptions = {},
  ) {
    const structured =
      typeof measureOrExceeded === 'string'
        ? new LimitExceededError(measureOrExceeded, actualOrMessage as number, limit as number, options)
        : new LimitExceededError(measureOrExceeded, actualOrMessage as string | undefined)
    super(structured.message, {
      code: 'render-limit',
      refusals: structured.exceeded.map((entry) => ({ code: 'limit', subject: entry.measure, message: entry.message })),
    })
    this.exceeded = structured.exceeded
  }

  static collected(exceeded: readonly [LimitExceeded, ...LimitExceeded[]], message: string, refusalOptions: RefusalOptions): RenderLimitError {
    const error = new RenderLimitError(exceeded, message)
    return Object.assign(error, refusalOptions, { refusals: refusalOptions.refusals ?? error.refusals })
  }
}

export class RenderOversetError extends RenderRefusedError {
  override name = 'RenderOversetError'
  readonly page: number
  readonly papers: number

  constructor(page: number, papers: number) {
    super(
      `A page with bleed or marks is one printed piece, but page ${page + 1} needs ${papers} papers. Shorten the content, or remove the bleed and marks, to clear this refusal.`,
      { code: 'render-overset' },
    )
    this.page = page
    this.papers = papers
  }
}

export type ColorProfileUse = 'press' | 'proof'

const PROFILE_CLEARS: Record<ColorProfileUse, string> = {
  press: 'a valid ICC output profile',
  proof: 'a valid CMYK output profile',
}

export class RenderColorProfileError extends RenderRefusedError {
  override name = 'RenderColorProfileError'
  readonly profile: ColorProfileUse
  readonly found: string
  readonly supported: string

  constructor(profile: ColorProfileUse, found: string, supported: string) {
    super(`The ${profile} profile has unsupported ${found}; supported: ${supported}. Supply ${PROFILE_CLEARS[profile]} to clear this refusal.`, {
      code: 'render-color-profile',
      subject: profile,
    })
    this.profile = profile
    this.found = found
    this.supported = supported
  }
}

export function colorProfileRefusal(use: ColorProfileUse, error: unknown): RenderRefusedError | undefined {
  if (error instanceof RenderRefusedError) return error
  if (error instanceof ProfileUnsupportedError) return new RenderColorProfileError(use, error.found, error.supported)
  return undefined
}
