export class RendererUnavailableError extends Error {
  override name = 'RendererUnavailableError'
}

// A render that produced something the host's limits refuse, or a page that
// never said it was ready. The message names which.
export class RenderRefusedError extends Error {
  override name = 'RenderRefusedError'
}
