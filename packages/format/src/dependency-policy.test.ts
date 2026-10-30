import { describe, expect, test } from 'bun:test'
import { dependencyDecision } from './dependency-policy.ts'

describe('dependency policy', () => {
  const approved = ['https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com']

  test('package CDNs require exact versions', () => {
    expect(dependencyDecision('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.js', approved).allowed).toBe(true)
    for (const url of [
      'https://cdn.jsdelivr.net/npm/chart.js/dist/chart.js',
      'https://cdn.jsdelivr.net/npm/chart.js@latest/dist/chart.js',
      'https://cdn.jsdelivr.net/npm/chart.js@^4/dist/chart.js',
    ]) {
      const decision = dependencyDecision(url, approved)
      expect(decision.allowed).toBe(false)
      if (!decision.allowed) expect(decision.reason).toContain('exact x.y.z package version')
    }
  })

  test('approval is exact by origin and Google Fonts is exempt from versions', () => {
    expect(dependencyDecision('https://fonts.googleapis.com/css2?family=Inter', approved).allowed).toBe(true)
    expect(dependencyDecision('https://evil.example/library@1.2.3/a.js', approved).allowed).toBe(false)
    expect(dependencyDecision('https://cdn.jsdelivr.net/npm/a@1.2.3/x.js', []).allowed).toBe(false)
  })
})
