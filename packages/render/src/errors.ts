import { type LimitExceeded, LimitExceededError, type LimitMeasure, type LimitRefusalOptions, Refusal, type RefusalOptions } from '@segnavia/format'
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
export class RenderLimitError extends RenderRefusedError {
  override name = 'RenderLimitError'
  readonly exceeded: readonly LimitExceeded[]

  constructor(measure: LimitMeasure, actual: number, limit: number, options?: LimitRefusalOptions)
  constructor(exceeded: readonly [LimitExceeded, ...LimitExceeded[]], message?: string, refusalOptions?: RefusalOptions)
  constructor(
    measureOrExceeded: LimitMeasure | readonly [LimitExceeded, ...LimitExceeded[]],
    actualOrMessage?: number | string,
    limitOrRefusalOptions?: number | RefusalOptions,
    options: LimitRefusalOptions = {},
  ) {
    const structured =
      typeof measureOrExceeded === 'string'
        ? new LimitExceededError(measureOrExceeded, actualOrMessage as number, limitOrRefusalOptions as number, options)
        : new LimitExceededError(measureOrExceeded, actualOrMessage as string | undefined)
    const refusalOptions = typeof measureOrExceeded === 'string' ? undefined : (limitOrRefusalOptions as RefusalOptions | undefined)
    super(structured.message, {
      code: 'render-limit',
      ...refusalOptions,
      refusals: refusalOptions?.refusals ?? structured.exceeded.map((entry) => ({ code: 'limit', subject: entry.measure, message: entry.message })),
    })
    this.exceeded = structured.exceeded
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
