import { expect, test } from 'bun:test'
import { Refusal } from '@segnavia/format'
import { RendererUnavailableError } from '../errors.ts'
import type { Renderer } from '../renderer.ts'
import { runRenderRequest, type OpenRenderer, type RenderEnvironment } from './run.ts'

const encoder = new TextEncoder()
const environment = { SEGNAVIA_CHROMIUM: '/chromium' }

function request(render: string, options: Record<string, unknown> = {}, document: unknown = {}): Uint8Array {
  return encoder.encode(JSON.stringify({ render, document: render === 'pages' ? [document] : document, options }))
}

function rendererFor(call: (method: string, document: unknown, options: unknown) => Promise<Uint8Array>, close: () => void): Renderer {
  const invoke = (method: string) => (document: unknown, options: unknown) => call(method, document, options)
  return {
    pagePdf: invoke('pagePdf'),
    pagesPdf: invoke('pagesPdf'),
    bookPdf: invoke('bookPdf'),
    deckPdf: invoke('deckPdf'),
    close: async () => close(),
  } as Renderer
}

function opened(calls: unknown[][] = [], failure?: Error): { open: OpenRenderer; closed: () => number } {
  let closes = 0
  return {
    open: async (options) => {
      calls.push(['open', options])
      return rendererFor(async (...args) => {
        if (failure) throw failure
        calls.push(args)
        return new Uint8Array([37, 80, 68, 70])
      }, () => closes++)
    },
    closed: () => closes,
  }
}

test.each([
  ['page', 'pagePdf'],
  ['pages', 'pagesPdf'],
  ['book', 'bookPdf'],
  ['deck', 'deckPdf'],
])('%s reaches %s with parsed options and closes', async (render, method) => {
  const calls: unknown[][] = []
  const host = opened(calls)
  const outcome = await runRenderRequest(request(render, { boundMs: 12 }), environment, host.open)
  expect(outcome).toEqual({ exitCode: 0, stdout: new Uint8Array([37, 80, 68, 70]), stderr: '' })
  expect(calls[1]?.[0]).toBe(method)
  expect(calls[1]?.[2]).toMatchObject({ boundMs: 12 })
  expect(host.closed()).toBe(1)
})

test('passes Chromium environment settings and a directory font source', async () => {
  const calls: unknown[][] = []
  const host = opened(calls)
  const input = encoder.encode(
    JSON.stringify({
      render: 'page',
      document: {},
      options: {},
      fonts: { body: { family: 'Body', faces: [{ src: 'body.woff2', format: 'woff2' }] } },
    }),
  )
  const env: RenderEnvironment = { SEGNAVIA_CHROMIUM: '/chromium', SEGNAVIA_CHROMIUM_CONTAINER: '1', SEGNAVIA_FONTS: '/fonts' }
  expect((await runRenderRequest(input, env, host.open)).exitCode).toBe(0)
  expect(calls[0]?.[1]).toMatchObject({ executablePath: '/chromium', args: expect.any(Array) })
  expect(calls[1]?.[2]).toMatchObject({ fontSource: expect.any(Object) })
})

test.each([
  ['invalid JSON', encoder.encode('{'), environment],
  ['unknown render', request('other'), environment],
  ['function option', request('page', { assets: {} }), environment],
  ['missing Chromium', request('page'), {}],
  [
    'catalog without font root',
    encoder.encode(JSON.stringify({ render: 'page', document: {}, options: {}, fonts: { body: { family: 'Body', faces: [] } } })),
    environment,
  ],
])('%s exits 2 with one JSON line', async (_name, input, env) => {
  const outcome = await runRenderRequest(input, env, opened().open)
  expect(outcome.exitCode).toBe(2)
  expect(outcome.stderr.trim().split('\n')).toHaveLength(1)
  expect(JSON.parse(outcome.stderr).refusal).toBeDefined()
})

test('oversized stdin exits 2 under an injected bound', async () => {
  const outcome = await runRenderRequest(request('page'), environment, opened().open, 1)
  expect(outcome.exitCode).toBe(2)
  expect(JSON.parse(outcome.stderr).refusal.subject).toBe('stdin')
})

test('an unknown option and library refusal close while unavailable errors exit 1', async () => {
  const unknown = opened()
  expect((await runRenderRequest(request('page', { extra: true }), environment, unknown.open)).exitCode).toBe(2)
  expect(unknown.closed()).toBe(1)

  const refused = opened([], new Refusal('document', 'no'))
  expect((await runRenderRequest(request('page'), environment, refused.open)).exitCode).toBe(2)
  expect(refused.closed()).toBe(1)

  const failed = opened([], new RendererUnavailableError('gone'))
  expect((await runRenderRequest(request('page'), environment, failed.open)).exitCode).toBe(1)
  expect(failed.closed()).toBe(1)
})
