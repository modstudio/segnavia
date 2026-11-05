import { expect, test } from 'bun:test'
import { requestFromFrame } from './frame-request.ts'

test('a frame request timeout rejects with its error and removes its listener', async () => {
  const listeners = new Set<(event: MessageEvent) => void>()
  const previousWindow = globalThis.window
  Object.assign(globalThis, {
    window: {
      addEventListener(name: string, listener: (event: MessageEvent) => void) {
        if (name === 'message') listeners.add(listener)
      },
      removeEventListener(name: string, listener: (event: MessageEvent) => void) {
        if (name === 'message') listeners.delete(listener)
      },
    },
  })
  const frame = { contentWindow: { postMessage() {} } } as unknown as HTMLIFrameElement
  const request = requestFromFrame(
    frame,
    (post) => {
      post()
      return () => {}
    },
    { type: 'request' },
    () => undefined,
    (ms) => new Error(`Timed out after ${ms} ms.`),
    1,
  )

  expect(listeners.size).toBe(1)
  await expect(request.promise).rejects.toThrow('Timed out after 1 ms.')
  expect(listeners.size).toBe(0)
  Object.assign(globalThis, { window: previousWindow })
})
