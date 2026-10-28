import { expect, test } from 'bun:test'
import { RenderRefusedError } from './errors.ts'
import { renderFailure } from './render-failure.ts'
import { RenderTimeoutError } from './render-deadline.ts'

test('maps crash, close and disconnect and passes other errors through', () => {
  const timeout = new RenderTimeoutError('bound')
  const refused = new RenderRefusedError('ready')
  const raw = new Error('Target closed')
  const rows = [
    {
      facts: { crashed: true, disconnected: false, closed: false, heapMb: 128 },
      error: raw,
      name: 'RenderRefusedError',
      message: "The page crashed, most likely by passing the renderer's JavaScript heap limit of 128 MB. Simplify the page or raise jsHeapMb.",
    },
    {
      facts: { crashed: false, disconnected: false, closed: true, heapMb: 2048 },
      error: raw,
      name: 'RendererUnavailableError',
      message: 'The renderer was closed during the render.',
    },
    {
      facts: { crashed: false, disconnected: true, closed: false, heapMb: 2048 },
      error: raw,
      name: 'RendererUnavailableError',
      message: "The renderer's browser exited during the render; the next render relaunches it.",
    },
    {
      facts: { crashed: true, disconnected: true, closed: true, heapMb: 64 },
      error: raw,
      name: 'RenderRefusedError',
      message: "The page crashed, most likely by passing the renderer's JavaScript heap limit of 64 MB. Simplify the page or raise jsHeapMb.",
    },
    {
      facts: { crashed: false, disconnected: true, closed: true, heapMb: 64 },
      error: raw,
      name: 'RendererUnavailableError',
      message: 'The renderer was closed during the render.',
    },
    { facts: { crashed: false, disconnected: false, closed: false, heapMb: 2048 }, error: timeout, same: timeout },
    { facts: { crashed: false, disconnected: false, closed: false, heapMb: 2048 }, error: refused, same: refused },
    { facts: { crashed: false, disconnected: false, closed: false, heapMb: 2048 }, error: raw, same: raw },
  ] as const
  for (const row of rows) {
    const result = renderFailure(row.facts, row.error)
    if ('same' in row) {
      expect(result).toBe(row.same)
      continue
    }
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).name).toBe(row.name)
    expect((result as Error).message).toBe(row.message)
  }
})
