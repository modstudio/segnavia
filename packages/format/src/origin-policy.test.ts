import { describe, expect, test } from 'bun:test'
import { DEFAULT_ORIGINS, type OriginApproval, originDecision } from './origin-policy.ts'

describe('origin policy', () => {
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
      if (!decision.allowed) expect(decision.reason).toContain('exact x.y.z package version')
    }
  })

  test('accepts pinned jQuery slim builds', () => {
    expect(originDecision('https://code.jquery.com/jquery-3.7.1.slim.js', 'script', [], true).allowed).toBe(true)
    expect(originDecision('https://code.jquery.com/jquery-3.7.1.slim.min.js', 'script', [], true).allowed).toBe(true)
  })
})
