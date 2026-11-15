import { describe, expect, test } from 'bun:test'
import type { FontCatalog } from './font-catalog.ts'
import { urlFontSource } from './url-font-source.ts'

const catalog = { body: { family: 'Body', faces: [{ src: 'body.woff2', format: 'woff2' as const }] } } satisfies FontCatalog
const signal = AbortSignal.any([])

describe('urlFontSource', () => {
  test('resolves against baseUrl, uses the host fetch, and caches', async () => {
    let requested: string | undefined
    let received: AbortSignal | null | undefined
    let calls = 0
    const source = urlFontSource(catalog, {
      baseUrl: 'https://fonts.example/app/',
      fetch: async (input, init) => {
        calls++
        requested = String(input)
        received = init?.signal
        return new Response(new Uint8Array(Buffer.from('wOF2')))
      },
    })
    await source.font('body', { signal })
    await source.font('body', { signal })
    expect(requested).toBe('https://fonts.example/app/body.woff2')
    expect(received?.aborted).toBe(false)
    expect(calls).toBe(1)
  })

  test('refuses a non-ok response naming its URL and status', async () => {
    const source = urlFontSource(catalog, { baseUrl: 'https://fonts.example/', fetch: async () => new Response('', { status: 404 }) })
    await expect(source.font('body', { signal })).rejects.toThrow(/fonts\.example\/body\.woff2.*404/)
  })

  test.each(['file:///tmp/body.woff2', 'data:font/woff2;base64,d09GMg=='])('refuses the %s scheme', async (src) => {
    const source = urlFontSource({ body: { family: 'Body', faces: [{ src, format: 'woff2' }] } })
    await expect(source.font('body', { signal })).rejects.toThrow(new RegExp(`${new URL(src).protocol}.*http:.*https:`))
  })

  test('redacts URL credentials, query, and fragment from refusals', async () => {
    const source = urlFontSource(
      { body: { family: 'Body', faces: [{ src: 'https://user:pass@fonts.example/body.woff2?token=secret#face', format: 'woff2' }] } },
      { fetch: async () => new Response('', { status: 403 }) },
    )
    const error = await source.font('body', { signal }).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('https://fonts.example/body.woff2')
    expect((error as Error).message).not.toMatch(/user|pass|token|secret|#face/)
  })

  test('stops a streaming response at the per-face cap', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(Buffer.from('wOF2')))
        controller.enqueue(new Uint8Array([0]))
      },
      cancel() {
        cancelled = true
      },
    })
    const source = urlFontSource(catalog, { baseUrl: 'https://fonts.example/', fetch: async () => new Response(body), limits: { each: 4 } })
    await expect(source.font('body', { signal })).rejects.toMatchObject({ exceeded: [{ actual: 5, limit: 4 }] })
    expect(cancelled).toBe(true)
  })
})
