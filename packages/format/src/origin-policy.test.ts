import { describe, expect, test } from 'bun:test'
import { authoredOrigin, DEFAULT_ORIGINS, type OriginApproval, originDecision } from './origin-policy.ts'

describe('origin policy', () => {
  test('opaque URLs do not report the serialized null origin', () => {
    expect(authoredOrigin('data:text/plain,x')).toBeUndefined()
    const decision = originDecision('data:image/png,x', 'image', [], false)
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.refusal.origin).toBeUndefined()
  })

  test('defaults approve only their declared fetch kinds', () => {
    expect(originDecision('https://fonts.googleapis.com/css2?family=Inter', 'style', [], true).allowed).toBe(true)
    expect(originDecision('https://fonts.googleapis.com/css2?family=Inter', 'script', [], true).allowed).toBe(false)
    expect(originDecision('https://fonts.gstatic.com/s/inter.woff2', 'font', [], true).allowed).toBe(true)
    expect(originDecision('https://example.com/image.png', 'image', [], true).allowed).toBe(false)
  })

  test('script approvals exist only for scripted frames', () => {
    const url = 'https://cdn.jsdelivr.net/npm/example@1.2.3/index.js'
    expect(originDecision(url, 'script', undefined, true).allowed).toBe(true)
    expect(originDecision(url, 'script', [{ origin: 'https://cdn.jsdelivr.net', kinds: ['script'] }], false).allowed).toBe(false)
  })

  test('host approvals add kinds without replacing defaults', () => {
    const approvals: OriginApproval[] = [{ origin: 'https://assets.example', kinds: ['image', 'style'] }]
    expect(originDecision('https://assets.example/a.png', 'image', approvals, true).allowed).toBe(true)
    expect(originDecision('https://assets.example/a.js', 'script', approvals, true).allowed).toBe(false)
    expect(originDecision('https://fonts.googleapis.com/css2?family=Inter', 'style', approvals, true).allowed).toBe(true)
  })

  test('all default script CDNs require exact versions', () => {
    const examples: [string, string][] = [
      ['https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.js', 'https://cdn.jsdelivr.net/npm/chart.js/dist/chart.js'],
      ['https://unpkg.com/react@18.2.0/index.js', 'https://unpkg.com/react/index.js'],
      ['https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jquery/latest/jquery.min.js'],
      ['https://cdn.tailwindcss.com/3.4.1', 'https://cdn.tailwindcss.com'],
      ['https://code.jquery.com/jquery-3.7.1.min.js', 'https://code.jquery.com/jquery-latest.min.js'],
    ]
    for (const [pinned, unpinned] of examples) {
      expect(originDecision(pinned, 'script', [], true).allowed).toBe(true)
      const decision = originDecision(unpinned, 'script', DEFAULT_ORIGINS, true)
      expect(decision.allowed).toBe(false)
      if (!decision.allowed) expect(decision.refusal.message).toContain('exact x.y.z package version')
    }
  })

  test('accepts pinned jQuery slim builds', () => {
    expect(originDecision('https://code.jquery.com/jquery-3.7.1.slim.js', 'script', [], true).allowed).toBe(true)
    expect(originDecision('https://code.jquery.com/jquery-3.7.1.slim.min.js', 'script', [], true).allowed).toBe(true)
  })

  test('keeps refusal codes, messages, and clearing advice separate', () => {
    expect(originDecision('images/a.png', 'image', [], false)).toEqual({
      allowed: false,
      refusal: {
        url: 'images/a.png',
        kind: 'image',
        reason: 'not-absolute',
        message: '"images/a.png" is not an absolute https URL',
        advice: 'an absolute URL at an approved origin clears this refusal',
      },
    })
    expect(originDecision('https://outside.example/a.png', 'image', [], false)).toEqual({
      allowed: false,
      refusal: {
        url: 'https://outside.example/a.png',
        origin: 'https://outside.example',
        kind: 'image',
        reason: 'unapproved-origin',
        message: 'https://outside.example/a.png at origin https://outside.example is not approved for image',
        advice: 'add { origin: "https://outside.example", kinds: ["image"] } to origins to clear this refusal',
      },
    })
    expect(originDecision('https://cdn.jsdelivr.net/npm/example/index.js', 'script', [], true)).toEqual({
      allowed: false,
      refusal: {
        url: 'https://cdn.jsdelivr.net/npm/example/index.js',
        origin: 'https://cdn.jsdelivr.net',
        kind: 'script',
        reason: 'unversioned-script',
        message: 'https://cdn.jsdelivr.net/npm/example/index.js does not name an exact x.y.z package version',
        advice: 'use an exact version to clear this refusal',
      },
    })
  })
})
