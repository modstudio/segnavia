import { afterEach, expect, test } from 'bun:test'
import { DeckController } from './controller.ts'
import { DeckRefusedError } from './deck-refusal.ts'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

test('a network failure dispatches one deck refusal and preserves the rejection', async () => {
  const cause = new Error('network unavailable')
  globalThis.fetch = (() => Promise.reject(cause)) as unknown as typeof fetch
  const controller = new DeckController({ hash: null, persist: false })
  const errors: ErrorEvent[] = []
  controller.addEventListener('error', (event) => errors.push(event as ErrorEvent))
  const url = 'https://example.test/deck.json'

  await expect(controller.loadUrl(url)).rejects.toBe(cause)
  expect(errors).toHaveLength(1)
  expect(errors[0]?.error).toBeInstanceOf(DeckRefusedError)
  expect(errors[0]?.error).toMatchObject({ subject: url, cause })
})

test('a non-ok response dispatches one deck refusal and preserves the rejection', async () => {
  const response = new Response('', { status: 404 })
  globalThis.fetch = (() => Promise.resolve(response)) as unknown as typeof fetch
  const controller = new DeckController({ hash: null, persist: false })
  const errors: ErrorEvent[] = []
  controller.addEventListener('error', (event) => errors.push(event as ErrorEvent))
  const url = 'https://example.test/deck.json'

  await expect(controller.loadUrl(url)).rejects.toThrow('answered 404')
  expect(errors).toHaveLength(1)
  expect(errors[0]?.error).toBeInstanceOf(DeckRefusedError)
  expect(errors[0]?.error).toMatchObject({ subject: url })
  expect(errors[0]?.error.cause).toBeInstanceOf(Error)
})

test('a URL load accepts watched facts and an explicit content base', async () => {
  globalThis.fetch = (() =>
    Promise.resolve(
      Response.json({
        type: 'document',
        kind: 'deck',
        title: 'Resume',
        children: [{ type: 'slide', id: 'one', holdMs: 100, content: { kind: 'html', html: '' } }],
      }),
    )) as unknown as typeof fetch
  const controller = new DeckController({ hash: null, persist: false })

  await controller.loadUrl('https://example.test/deck.json', {
    base: 'https://assets.example.test/deck/',
    watched: [{ slideId: 'one', reached: true, watchedThrough: true }],
  })

  expect(controller.state.watched.complete).toBe(true)
  expect(controller.url('voice.mp3')).toBe('https://assets.example.test/deck/voice.mp3')
})
