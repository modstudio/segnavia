import { describe, expect, test } from 'bun:test'
import { assetLimitRefusal, assetRouteDecision, fetchKind, mergedFontFailures } from './browser-tab.ts'

describe('asset route decision', () => {
  const origins = [{ origin: 'https://cdn.jsdelivr.net', kinds: ['script'] as const }]
  const url = 'https://cdn.jsdelivr.net/npm/example@1.2.3/index.js'
  const answer = { body: new Uint8Array([1, 2]), contentType: 'text/javascript' }

  test('fulfills approved answers and names approved misses', async () => {
    expect(await assetRouteDecision(url, 'script', origins, async () => answer, new AbortController().signal)).toEqual({ action: 'fulfill', ...answer })
    expect(await assetRouteDecision(url, 'script', origins, undefined, new AbortController().signal)).toEqual({ action: 'missing', url })
  })

  test('aborts unapproved URLs and continues inline data without consulting the cache', async () => {
    let lookups = 0
    const lookup = async () => {
      lookups++
      return answer
    }
    expect(await assetRouteDecision('https://evil.example/a.js', 'script', origins, lookup, new AbortController().signal)).toEqual({ action: 'abort' })
    expect(await assetRouteDecision('data:text/javascript,ok', 'script', origins, lookup, new AbortController().signal)).toEqual({ action: 'continue' })
    expect(lookups).toBe(0)
  })
})

test('Playwright resource types map only the four approved asset kinds', () => {
  expect(['script', 'stylesheet', 'font', 'image'].map(fetchKind)).toEqual(['script', 'style', 'font', 'image'])
  for (const type of ['fetch', 'xhr', 'websocket', 'manifest', 'other', 'document', 'media', 'eventsource']) expect(fetchKind(type)).toBeUndefined()
})

test('asset caps name the address, byte count, limit and host option, and raised caps admit the answer', () => {
  const url = 'https://images.example/a.png'
  expect(assetLimitRefusal(url, 11, 0, { each: 10, bytes: 50 })).toContain(`${url} answered 11 bytes`)
  expect(assetLimitRefusal(url, 6, 45, { each: 10, bytes: 50 })).toContain('limits.assets.bytes of 50 bytes')
  expect(assetLimitRefusal(url, 11, 45, { each: 20, bytes: 100 })).toBeUndefined()
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
