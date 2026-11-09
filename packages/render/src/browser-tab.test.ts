import { describe, expect, test } from 'bun:test'
import type { Browser, Route } from 'playwright-core'
import { assetLimitRefusal, assetRouteDecision, browserContextOptions, fetchKind, mergedFontFailures, renderInBrowserTab } from './browser-tab.ts'
import { RenderLimitError } from './errors.ts'

describe('asset route decision', () => {
  const origins = [{ origin: 'https://cdn.jsdelivr.net', kinds: ['script'] as const }]
  const url = 'https://cdn.jsdelivr.net/npm/example@1.2.3/index.js'
  const answer = { body: new Uint8Array([1, 2]), contentType: 'text/javascript' }

  test('fulfills approved answers and names approved misses', async () => {
    expect(await assetRouteDecision(url, 'script', origins, async () => answer, new AbortController().signal)).toEqual({ action: 'fulfill', ...answer })
    expect(await assetRouteDecision(url, 'script', origins, undefined, new AbortController().signal)).toEqual({ action: 'missing', url })
  })

  test('aborts unapproved URLs without consulting the cache', async () => {
    let lookups = 0
    const lookup = async () => {
      lookups++
      return answer
    }
    expect(await assetRouteDecision('https://evil.example/a.js', 'script', origins, lookup, new AbortController().signal)).toEqual({
      action: 'abort',
      reason: expect.stringContaining('https://evil.example'),
    })
    expect(lookups).toBe(0)
  })

  test('turns rejected and late asset answers into refusals', async () => {
    expect(
      await assetRouteDecision(
        url,
        'script',
        origins,
        async () => {
          throw new Error('storage unavailable')
        },
        new AbortController().signal,
      ),
    ).toEqual({ action: 'abort', reason: expect.stringContaining(`${url}: storage unavailable`) })

    const controller = new AbortController()
    expect(
      await assetRouteDecision(
        url,
        'script',
        origins,
        async () => {
          controller.abort()
          return answer
        },
        controller.signal,
      ),
    ).toEqual({ action: 'abort', reason: expect.stringContaining(`${url} answered after its asset request was aborted`) })
  })
})

test('Playwright resource types map only the four approved asset kinds', () => {
  expect(['script', 'stylesheet', 'font', 'image'].map(fetchKind)).toEqual(['script', 'style', 'font', 'image'])
  for (const type of ['fetch', 'xhr', 'websocket', 'manifest', 'other', 'document', 'media', 'eventsource']) expect(fetchKind(type)).toBeUndefined()
})

test('browser contexts are offline and block service workers', () => {
  expect(browserContextOptions({ viewport: { width: 400, height: 200 }, scripts: true })).toMatchObject({
    offline: true,
    serviceWorkers: 'block',
  })
})

test('asset caps name the address, byte count, limit and host option, and raised caps admit the answer', () => {
  const url = 'https://images.example/a.png'
  expect(assetLimitRefusal(url, 11, 0, { each: 10, bytes: 50 })?.message).toBe(
    `The asset for ${url} is 11 bytes, above the assets.each limit of 10; raise the host's limits.assets.each, or reduce the content to clear this refusal.`,
  )
  expect(assetLimitRefusal(url, 6, 45, { each: 10, bytes: 50 })?.message).toBe(
    `The document assets for ${url} is 51 bytes, above the assets.bytes limit of 50; raise the host's limits.assets.bytes, or reduce the content to clear this refusal.`,
  )
  expect(assetLimitRefusal(url, 11, 45, { each: 20, bytes: 100 })).toBeUndefined()
})

test('asset limits stay structured when another asset refusal precedes them', async () => {
  const blocked = 'https://blocked.example/a.js'
  const oversized = 'https://images.example/a.png'
  let routeHandler: ((route: Route) => Promise<void>) | undefined
  const context = {
    route: async (_pattern: string, handler: (route: Route) => Promise<void>) => {
      routeHandler = handler
    },
    routeWebSocket: async () => {},
    newPage: async () => ({
      on: () => {},
      setContent: async () => {
        const request = (url: string, resourceType: string) => ({ url: () => url, resourceType: () => resourceType })
        await routeHandler?.({ request: () => request(blocked, 'script'), abort: async () => {} } as unknown as Route)
        await routeHandler?.({ request: () => request(oversized, 'image'), abort: async () => {} } as unknown as Route)
      },
      evaluate: async () => true,
    }),
    close: async () => {},
  }
  const browser = { newContext: async () => context } as unknown as Browser
  const rendering = renderInBrowserTab(
    browser,
    {
      viewport: { width: 100, height: 100 },
      scripts: true,
      html: '<p>asset refusal</p>',
      readiness: { author: false, diagrams: false },
      origins: [{ origin: 'https://images.example', kinds: ['image'] }],
      assets: async () => ({ body: new Uint8Array(6), contentType: 'image/png' }),
      limits: { assets: { each: 5, bytes: 10 } },
    },
    undefined,
    { settled: () => false, opened: () => {}, crashed: () => {} },
    async () => undefined,
  )
  const originReason = `${blocked} at origin https://blocked.example is not approved for script; add { origin: "https://blocked.example", kinds: ["script"] } to origins to clear this refusal`
  const limitReason = `The asset for ${oversized} is 6 bytes, above the assets.each limit of 5; raise the host's limits.assets.each, or reduce the content to clear this refusal.`
  await expect(rendering).rejects.toEqual(
    expect.objectContaining({
      message: `${originReason}; ${limitReason}`,
      exceeded: [{ measure: 'assets.each', limit: 5, actual: 6, where: oversized, message: limitReason }],
    }),
  )
  await expect(rendering).rejects.toBeInstanceOf(RenderLimitError)
})

test('font load reports merge supplied-resolution and frame-load failures', () => {
  expect(
    mergedFontFailures(
      [{ font: 'missing', family: 'missing', reason: 'unsupplied' }],
      JSON.stringify([{ font: 'body', family: 'Body', weight: 700, reason: 'unloaded' }]),
    ),
  ).toEqual([
    { font: 'missing', family: 'missing', reason: 'unsupplied' },
    { font: 'body', family: 'Body', weight: 700, reason: 'unloaded' },
  ])
})
