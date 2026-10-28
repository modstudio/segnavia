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
export class RenderRefusedError extends Error {
  override name = 'RenderRefusedError'
}
