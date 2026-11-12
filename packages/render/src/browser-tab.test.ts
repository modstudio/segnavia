import { describe, expect, test } from 'bun:test'
import type { Browser, Route } from 'playwright-core'
import {
  assetLimitRefusal,
  assetRouteDecision,
  browserContextOptions,
  fetchKind,
  markupAssetRefusal,
  mergedFontFailures,
  renderInBrowserTab,
} from './browser-tab.ts'
import { RenderLimitError, RenderRefusedError } from './errors.ts'
import { RENDER_PROGRESS_BINDING } from './progress.ts'

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

  test('answers only requests under an approved path prefix', async () => {
    const approvals = [{ origin: 'https://cdn.jsdelivr.net', kinds: ['style', 'font'] as const, pathname: '/fontsource' }]
    const allowed = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff2'
    const refused = 'https://cdn.jsdelivr.net/npm/x@1.2.3/x.css'
    const requested: string[] = []
    const lookup = async (requestedUrl: string) => {
      requested.push(requestedUrl)
      return answer
    }
    expect(await assetRouteDecision(allowed, 'font', approvals, lookup, new AbortController().signal)).toEqual({ action: 'fulfill', ...answer })
    expect(await assetRouteDecision(refused, 'style', approvals, lookup, new AbortController().signal)).toEqual({
      action: 'abort',
      reason: expect.stringContaining('outside the approved style path prefixes'),
    })
    expect(requested).toEqual([allowed])
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

test('markup preflight ignores scripts-off sources and refuses unapproved images', () => {
  expect(markupAssetRefusal('<script src="https://cdn.jsdelivr.net/npm/x@1.2.3/x.js"></script>', { scripts: false })).toBeUndefined()
  expect(markupAssetRefusal('<img src="https://outside.example/a.png">', { scripts: false })).toBe(
    'https://outside.example/a.png at origin https://outside.example is not approved for image; add { origin: "https://outside.example", kinds: ["image"] } to origins to clear this refusal',
  )
})

test('the browser tab exposes and re-bounds the progress reporter only when supplied', async () => {
  const exposed = new Map<string, (value: unknown) => void>()
  const page = {
    on: () => {},
    exposeFunction: async (name: string, callback: (value: unknown) => void) => {
      exposed.set(name, callback)
    },
    setContent: async () => {},
    evaluate: async () => true,
  }
  const context = {
    route: async () => {},
    routeWebSocket: async () => {},
    newPage: async () => page,
    close: async () => {},
  }
  const browser = { newContext: async () => context } as unknown as Browser
  const setup = { viewport: { width: 100, height: 100 }, scripts: true, html: '<p>progress</p>', readiness: { author: false, diagrams: false } }
  const state = { settled: () => false, opened: () => {}, crashed: () => {} }
  await renderInBrowserTab(browser, setup, undefined, state, async () => undefined)
  expect(exposed.has(RENDER_PROGRESS_BINDING)).toBe(false)

  const reports: unknown[] = []
  await renderInBrowserTab(browser, { ...setup, progressReport: (progress) => reports.push(progress) }, undefined, state, async () => undefined)
  const report = exposed.get(RENDER_PROGRESS_BINDING)
  expect(report).toBeFunction()
  report?.({ pages: 2, total: 5 })
  report?.({ pages: 6, total: 5 })
  expect(reports).toEqual([{ pages: 2, total: 5 }])
})

test('a recorded layout failure wins over the readiness timeout', async () => {
  const failure = 'Layout provider margin refused its galley phase: broken'
  const page = {
    on: () => {},
    exposeFunction: async () => {},
    setContent: async () => {},
    waitForFunction: async () => {},
    evaluate: async () => failure,
  }
  const context = {
    route: async () => {},
    routeWebSocket: async () => {},
    newPage: async () => page,
    close: async () => {},
  }
  const browser = { newContext: async () => context } as unknown as Browser
  const rendering = renderInBrowserTab(
    browser,
    { viewport: { width: 100, height: 100 }, scripts: true, html: '<p>layout</p>', readiness: { author: false, diagrams: false, layouts: true } },
    undefined,
    { settled: () => false, opened: () => {}, crashed: () => {} },
    async () => undefined,
  )
  await expect(rendering).rejects.toEqual(expect.objectContaining({ message: failure }))
  await expect(rendering).rejects.toBeInstanceOf(RenderRefusedError)
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

test("a missing asset refusal takes precedence over the body's resulting error", async () => {
  const url = 'https://images.example/watermark.png'
  let routeHandler: ((route: Route) => Promise<void>) | undefined
  const context = {
    route: async (_pattern: string, handler: (route: Route) => Promise<void>) => {
      routeHandler = handler
    },
    routeWebSocket: async () => {},
    newPage: async () => ({
      on: () => {},
      setContent: async () => {},
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
      html: '<p>watermark</p>',
      readiness: { author: false, diagrams: false },
      origins: [{ origin: 'https://images.example', kinds: ['image'] }],
    },
    undefined,
    { settled: () => false, opened: () => {}, crashed: () => {} },
    async () => {
      const request = { url: () => url, resourceType: () => 'image' }
      await routeHandler?.({ request: () => request, abort: async () => {} } as unknown as Route)
      throw new Error('image decode failed')
    },
  )

  await expect(rendering).rejects.toEqual(new RenderRefusedError(`The host assets option did not answer approved requests: ${url}.`))
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
