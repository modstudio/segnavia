import { describe, expect, test } from 'bun:test'
import { dependencyRouteDecision } from './browser-tab.ts'

describe('dependency route decision', () => {
  const origin = ['https://cdn.jsdelivr.net']
  const url = 'https://cdn.jsdelivr.net/npm/example@1.2.3/index.js'
  const answer = { body: new Uint8Array([1, 2]), contentType: 'text/javascript' }

  test('fulfills approved answers and names approved misses', () => {
    expect(dependencyRouteDecision(url, origin, answer)).toEqual({ action: 'fulfill', ...answer })
    expect(dependencyRouteDecision(url, origin, undefined)).toEqual({ action: 'missing', url })
  })

  test('aborts unapproved URLs and continues inline data', () => {
    expect(dependencyRouteDecision('https://evil.example/a.js', origin, undefined)).toEqual({ action: 'abort' })
    expect(dependencyRouteDecision('data:text/javascript,ok', origin, undefined)).toEqual({ action: 'continue' })
  })
})
