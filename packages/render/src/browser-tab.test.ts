import { describe, expect, test } from 'bun:test'
import { dependencyOriginSet } from '@segnavia/format'
import { dependencyRouteDecision } from './browser-tab.ts'

describe('dependency route decision', () => {
  const origin = dependencyOriginSet(['https://cdn.jsdelivr.net'])
  const url = 'https://cdn.jsdelivr.net/npm/example@1.2.3/index.js'
  const answer = { body: new Uint8Array([1, 2]), contentType: 'text/javascript' }

  test('fulfills approved answers and names approved misses', async () => {
    expect(await dependencyRouteDecision(url, origin, async () => answer)).toEqual({ action: 'fulfill', ...answer })
    expect(await dependencyRouteDecision(url, origin, undefined)).toEqual({ action: 'missing', url })
  })

  test('aborts unapproved URLs and continues inline data without consulting the cache', async () => {
    let lookups = 0
    const lookup = async () => {
      lookups++
      return answer
    }
    expect(await dependencyRouteDecision('https://evil.example/a.js', origin, lookup)).toEqual({ action: 'abort' })
    expect(await dependencyRouteDecision('data:text/javascript,ok', origin, lookup)).toEqual({ action: 'continue' })
    expect(lookups).toBe(0)
  })
})
