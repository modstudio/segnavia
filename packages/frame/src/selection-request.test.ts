import { expect, test } from 'bun:test'
import { MESSAGE } from './bridge.ts'
import { requestSelection } from './selection-request.ts'

const listeners = new Set<(event: MessageEvent) => void>()
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

function harness(timeoutMs = 20) {
  const posts: Array<{ type: string; id: number }> = []
  const contentWindow = { postMessage: (message: { type: string; id: number }) => posts.push(message) }
  const frame = { contentWindow } as unknown as HTMLIFrameElement
  const request = requestSelection(
    frame,
    (post) => {
      post()
      return () => {}
    },
    'slide',
    timeoutMs,
  )
  const dispatch = (source: unknown, data: unknown) => {
    const event = { source, data } as MessageEvent
    for (const listener of [...listeners]) listener(event)
  }
  return { contentWindow, dispatch, frame, posts, request }
}

test('a selection reply must match the frame window and request id', async () => {
  const h = harness()
  const reply = { type: MESSAGE.selection, id: h.posts[0]?.id, text: 'Selection', pageText: 'Page' }
  let settled = false
  void h.request.promise.finally(() => {
    settled = true
  })
  h.dispatch({}, { ...reply, text: 'Stale source' })
  await Promise.resolve()
  expect(settled).toBe(false)
  h.dispatch(h.contentWindow, { ...reply, id: (reply.id ?? 0) + 1, text: 'Stale id' })
  await Promise.resolve()
  expect(settled).toBe(false)
  h.dispatch(h.contentWindow, reply)
  expect(await h.request.promise).toEqual({ text: 'Selection', pageText: 'Page' })
})

test('a selection request times out', async () => {
  const h = harness(1)
  await expect(h.request.promise).rejects.toThrow('slide did not send a valid reply within 1 ms')
})
