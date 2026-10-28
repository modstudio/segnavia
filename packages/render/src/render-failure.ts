import { RendererUnavailableError, RenderRefusedError } from './errors.ts'

export function renderFailure(facts: { crashed: boolean; disconnected: boolean; closed: boolean; heapMb: number }, error: unknown): unknown {
  if (facts.crashed) {
    return new RenderRefusedError(
      `The page crashed, most likely by passing the renderer's JavaScript heap limit of ${facts.heapMb} MB. Simplify the page or raise jsHeapMb.`,
    )
  }
  if (facts.closed) return new RendererUnavailableError('The renderer was closed during the render.')
  if (facts.disconnected) return new RendererUnavailableError("The renderer's browser exited during the render; the next render relaunches it.")
  return error
}
