import { describe, expect, test } from 'bun:test'
import { expandLogoMotifs } from '@segnavia/html'
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
import { RENDER_DOCUMENT_SANDBOX, RENDER_DOCUMENT_URL } from './render-document-origin.ts'

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
      cause: {
        code: 'unapproved-origin',
        subject: 'https://evil.example/a.js',
        message:
          'https://evil.example/a.js at origin https://evil.example is not approved for script; add { origin: "https://evil.example", kinds: ["script"] } to origins to clear this refusal',
        adviceFor: 'host',
      },
    })
    expect(lookups).toBe(0)
  })

  test('directs unsupported and unversioned requests to the author', async () => {
    expect(await assetRouteDecision('https://example.test/data', undefined, origins, undefined, new AbortController().signal)).toEqual({
      action: 'abort',
      cause: {
        code: 'unsupported-fetch',
        subject: 'https://example.test/data',
        message: 'https://example.test/data uses unsupported fetching; no asset kind can approve it',
        adviceFor: 'author',
      },
    })
    expect(await assetRouteDecision('https://cdn.jsdelivr.net/npm/example/index.js', 'script', origins, undefined, new AbortController().signal)).toMatchObject(
      { action: 'abort', cause: { code: 'unversioned-script', adviceFor: 'author' } },
    )
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
      cause: {
        code: 'outside-approved-path',
        subject: refused,
        message:
          'https://cdn.jsdelivr.net/npm/x@1.2.3/x.css is outside the approved style path prefixes at https://cdn.jsdelivr.net: "/fontsource/css", "/fontsource"; add { origin: "https://cdn.jsdelivr.net", kinds: ["style"], pathname: "/npm/x@1.2.3/x.css" } to origins to clear this refusal',
        adviceFor: 'host',
      },
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
    ).toEqual({
      action: 'abort',
      cause: {
        code: 'host-rejected',
        subject: url,
        message: `The host assets option rejected ${url}: storage unavailable; answer the approved asset to clear this refusal`,
        adviceFor: 'host',
      },
    })

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
    ).toEqual({
      action: 'abort',
      cause: {
        code: 'late-answer',
        subject: url,
        message: `${url} answered after its asset request was aborted; settle assets before the render ends to clear this refusal`,
        adviceFor: 'host',
      },
    })
  })
})

test('a remote logo uses the ordinary approved image asset route', async () => {
  const url = 'https://images.example/logo.svg'
  const html = expandLogoMotifs('<header data-motif="segnavia:logo"></header>', { src: url, alt: 'House' })
  expect(markupAssetRefusal(html, { scripts: false })).toMatchObject([{ code: 'unapproved-origin', subject: url }])
  let requested = ''
  const answer = { body: new Uint8Array([1, 2, 3]), contentType: 'image/svg+xml' }
  expect(
    await assetRouteDecision(
      url,
      'image',
      [{ origin: 'https://images.example', kinds: ['image'] }],
      async (request) => {
        requested = request
        return answer
      },
      new AbortController().signal,
    ),
  ).toEqual({ action: 'fulfill', ...answer })
  expect(requested).toBe(url)
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
  expect(markupAssetRefusal('<img src="https://outside.example/a.png">', { scripts: false })).toEqual([
    {
      code: 'unapproved-origin',
      subject: 'https://outside.example/a.png',
      message:
        'https://outside.example/a.png at origin https://outside.example is not approved for image; add { origin: "https://outside.example", kinds: ["image"] } to origins to clear this refusal',
      adviceFor: 'host',
    },
  ])
  expect(markupAssetRefusal('<img src="images/a.png">', { scripts: false })).toMatchObject([{ code: 'not-absolute', adviceFor: 'author' }])
})

test('markup asset refusals expose their asset code and structured causes', async () => {
  const url = 'https://outside.example/a.png'
  const message = `${url} at origin https://outside.example is not approved for image; add { origin: "https://outside.example", kinds: ["image"] } to origins to clear this refusal`
  const rendering = renderInBrowserTab(
    { newContext: async () => Promise.reject(new Error('markup refusal did not stop browser setup')) } as unknown as Browser,
    { viewport: { width: 100, height: 100 }, scripts: false, html: `<img src="${url}">`, readiness: { author: false } },
    undefined,
    { settled: () => false, opened: () => {}, crashed: () => {} },
    async () => undefined,
  )
  await expect(rendering).rejects.toEqual(
    new RenderRefusedError(message, { code: 'asset', refusals: [{ code: 'unapproved-origin', subject: url, message, adviceFor: 'host' }] }),
  )
})

test('the live document route fulfills once and refuses later reserved-origin requests', async () => {
  const html = '<p>routed document</p>'
  const calls = { fulfilled: [] as unknown[], aborted: [] as string[] }
  let routeHandler: ((route: Route) => Promise<void>) | undefined
  const mainFrame = { page: () => ({ mainFrame: () => mainFrame }) }
  const send = async (url: string, navigation: boolean, frame: () => unknown) => {
    await routeHandler?.({
      request: () => ({ url: () => url, resourceType: () => 'document', isNavigationRequest: () => navigation, frame }),
      fulfill: async (options: unknown) => void calls.fulfilled.push(options),
      abort: async () => void calls.aborted.push(url),
    } as unknown as Route)
  }
  const context = {
    route: async (_pattern: string, handler: (route: Route) => Promise<void>) => {
      routeHandler = handler
    },
    routeWebSocket: async () => {},
    newPage: async () => ({
      on: () => {},
      goto: async () => {
        await send(RENDER_DOCUMENT_URL, true, () => mainFrame)
        await send(RENDER_DOCUMENT_URL, true, () => mainFrame)
        await send(`${RENDER_DOCUMENT_URL}asset`, false, () => mainFrame)
        await send(RENDER_DOCUMENT_URL, true, () => {
          throw new Error('frame is unavailable')
        })
      },
      evaluate: async () => true,
    }),
    close: async () => {},
  }
  const rendering = renderInBrowserTab(
    { newContext: async () => context } as unknown as Browser,
    { viewport: { width: 100, height: 100 }, scripts: true, html, readiness: { author: false } },
    undefined,
    { settled: () => false, opened: () => {}, crashed: () => {} },
    async () => undefined,
  )
  await expect(rendering).rejects.toMatchObject({ refusals: [{ subject: RENDER_DOCUMENT_URL }, { subject: `${RENDER_DOCUMENT_URL}asset` }] })
  const headers = { 'Content-Security-Policy': `sandbox ${RENDER_DOCUMENT_SANDBOX}` }
  expect(calls.fulfilled).toEqual([{ body: html, contentType: 'text/html; charset=utf-8', headers }])
  expect(calls.aborted).toEqual([RENDER_DOCUMENT_URL, `${RENDER_DOCUMENT_URL}asset`, RENDER_DOCUMENT_URL])
})

test('the browser tab exposes and re-bounds the progress reporter only when supplied', async () => {
  const exposed = new Map<string, (value: unknown) => void>()
  const page = {
    on: () => {},
    exposeFunction: async (name: string, callback: (value: unknown) => void) => {
      exposed.set(name, callback)
    },
    goto: async () => {},
    evaluate: async () => true,
  }
  const context = {
    route: async () => {},
    routeWebSocket: async () => {},
    newPage: async () => page,
    close: async () => {},
  }
  const browser = { newContext: async () => context } as unknown as Browser
  const setup = { viewport: { width: 100, height: 100 }, scripts: true, html: '<p>progress</p>', readiness: { author: false } }
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
    goto: async () => {},
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
    { viewport: { width: 100, height: 100 }, scripts: true, html: '<p>layout</p>', readiness: { author: false, layouts: true } },
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
      goto: async () => {
        const frame = { page: () => ({ mainFrame: () => frame }) }
        const request = (url: string, resourceType: string) => ({
          url: () => url,
          resourceType: () => resourceType,
          isNavigationRequest: () => false,
          frame: () => frame,
        })
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
      readiness: { author: false },
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
      refusals: [
        { code: 'unapproved-origin', subject: blocked, message: originReason, adviceFor: 'host' },
        { code: 'asset-limit', subject: oversized, message: limitReason, adviceFor: 'host' },
      ],
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
      goto: async () => {},
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
      readiness: { author: false },
      origins: [{ origin: 'https://images.example', kinds: ['image'] }],
    },
    undefined,
    { settled: () => false, opened: () => {}, crashed: () => {} },
    async () => {
      const frame = { page: () => ({ mainFrame: () => frame }) }
      const request = { url: () => url, resourceType: () => 'image', isNavigationRequest: () => false, frame: () => frame }
      await routeHandler?.({ request: () => request, abort: async () => {} } as unknown as Route)
      throw new Error('image decode failed')
    },
  )

  await expect(rendering).rejects.toEqual(
    new RenderRefusedError(`The host assets option did not answer approved requests: ${url}.`, {
      code: 'asset',
      refusals: [
        {
          code: 'unanswered',
          subject: url,
          message: `${url} was not answered by the host assets option; answer the approved asset to clear this refusal`,
          adviceFor: 'host',
        },
      ],
    }),
  )
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
