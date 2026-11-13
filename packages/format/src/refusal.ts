export interface RefusalCause {
  code: string
  subject?: string
  message: string
}

export interface RefusalOptions {
  subject?: string
  refusals?: readonly RefusalCause[]
  cause?: unknown
}

export class Refusal extends Error {
  override name = 'Refusal'
  readonly code: string
  readonly subject: string | undefined
  readonly refusals: readonly RefusalCause[]

  constructor(code: string, message: string, options: RefusalOptions = {}) {
    super(message, { cause: options.cause })
    this.code = code
    this.subject = options.subject
    this.refusals = options.refusals ?? []
  }
}
