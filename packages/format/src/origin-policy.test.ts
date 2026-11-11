import { describe, expect, test } from 'bun:test'
import { approvedOrigins, approvedSources, authoredOrigin, DEFAULT_ORIGINS, type OriginApproval, originDecision } from './origin-policy.ts'

const BUILT_IN_IMAGE_SOURCES = [...approvedSources([], 'image', true)]

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

  test('default image origins are image-only', () => {
    const urls = [
      'https://api.iconify.design/mdi/home.svg',
      'https://images.unsplash.com/photo-example',
      'https://plus.unsplash.com/premium_photo-example',
      'https://images.pexels.com/photos/1/example.jpeg',
    ]
    for (const url of urls) {
      expect(originDecision(url, 'image', [], true).allowed).toBe(true)
      for (const kind of ['style', 'font', 'script'] as const) expect(originDecision(url, kind, [], true).allowed).toBe(false)
    }
  })

  test('default Fontsource paths are scoped by fetch kind', () => {
    const stylesheet = 'https://cdn.jsdelivr.net/fontsource/css/inter@latest/latin-400.css'
    const font = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff2'
    const npmStyle = 'https://cdn.jsdelivr.net/npm/x@1.2.3/x.css'

    expect(originDecision(stylesheet, 'style', [], true).allowed).toBe(true)
    expect(originDecision(font, 'font', [], true).allowed).toBe(true)
    expect(originDecision(font, 'style', [], true).allowed).toBe(false)
    expect(originDecision(stylesheet, 'font', [], true).allowed).toBe(false)

    const decision = originDecision(npmStyle, 'style', [], true)
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.refusal.reason).toBe('outside-approved-path')
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

  test('path approvals match whole segments after URL parsing and combine', () => {
    const approvals: OriginApproval[] = [
      { origin: 'https://cdn.jsdelivr.net', kinds: ['style', 'font'], pathname: '/fontsource/' },
      { origin: 'https://cdn.jsdelivr.net', kinds: ['style'], pathname: '/npm/approved' },
    ]
    expect(originDecision('https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff2', 'font', approvals, true).allowed).toBe(true)
    expect(originDecision('https://cdn.jsdelivr.net/fontsourcex/a', 'font', approvals, true).allowed).toBe(false)
    expect(originDecision('https://cdn.jsdelivr.net/fontsource/../npm/a', 'font', approvals, true).allowed).toBe(false)
    expect(originDecision('https://cdn.jsdelivr.net/fontsource/%2e%2e/npm/a', 'font', approvals, true).allowed).toBe(false)
    expect(originDecision('https://cdn.jsdelivr.net/npm/approved/x.css', 'style', approvals, true).allowed).toBe(true)
  })

  test('refuses encoded separators inside an approved prefix', () => {
    for (const separator of ['%2F', '%5C']) {
      const decision = originDecision(
        `https://cdn.jsdelivr.net/fontsource/a${separator}b.woff2`,
        'font',
        [{ origin: 'https://cdn.jsdelivr.net', kinds: ['font'], pathname: '/fontsource' }],
        true,
      )
      expect(decision.allowed).toBe(false)
      if (!decision.allowed) {
        expect(decision.refusal.reason).toBe('outside-approved-path')
        expect(decision.refusal.message).toContain(separator)
        expect(decision.refusal.message).not.toContain('outside the approved font path prefixes')
      }
    }
  })

  test('refuses unreadable prefixes', () => {
    const approval = { origin: 'https://assets.example', kinds: ['image'] as const, pathname: '/approved' }
    for (const pathname of ['approved', '/a?b', '/a#b', '/a;b', '/a,b', '/a\\b', '/a/./b', '/a/../b', '/a/%2E/b', '/a/%2f/b', '/a/%5C/b']) {
      expect(originDecision('https://assets.example/a/b.png', 'image', [{ ...approval, pathname }], true).allowed).toBe(false)
    }
  })

  test.each(['/x https://evil.example', '/x"https://evil.example', '/café', '/100%', '//', '///', '//:1'])(
    'unreadable path prefix %s approves no CSP source',
    (pathname) => {
      const approvals = [{ origin: 'https://assets.example', kinds: ['image'] as const, pathname }]
      expect([...approvedSources(approvals, 'image', false)]).toEqual(BUILT_IN_IMAGE_SOURCES)
      expect(originDecision('https://assets.example/x.png', 'image', approvals, false).allowed).toBe(false)
    },
  )

  test('normalizes a root pathname to an unscoped approval', () => {
    const approvals = [{ origin: 'https://assets.example', kinds: ['image'] as const, pathname: '/' }]
    expect([...approvedOrigins(approvals, 'image', false)]).toEqual([...BUILT_IN_IMAGE_SOURCES, 'https://assets.example'])
    expect([...approvedSources(approvals, 'image', false)]).toEqual([...BUILT_IN_IMAGE_SOURCES, 'https://assets.example'])
    expect(originDecision('https://assets.example/a%2Fb.png', 'image', approvals, false).allowed).toBe(true)
  })

  test('path refusals name the URL, prefixes, and clearing approval', () => {
    const decision = originDecision(
      'https://cdn.jsdelivr.net/npm/x@1.2.3/x.css',
      'style',
      [{ origin: 'https://cdn.jsdelivr.net', kinds: ['style'], pathname: '/fontsource' }],
      true,
    )
    expect(decision).toEqual({
      allowed: false,
      refusal: {
        url: 'https://cdn.jsdelivr.net/npm/x@1.2.3/x.css',
        origin: 'https://cdn.jsdelivr.net',
        kind: 'style',
        reason: 'outside-approved-path',
        message:
          'https://cdn.jsdelivr.net/npm/x@1.2.3/x.css is outside the approved style path prefixes at https://cdn.jsdelivr.net: "/fontsource/css", "/fontsource"',
        advice: 'add { origin: "https://cdn.jsdelivr.net", kinds: ["style"], pathname: "/npm/x@1.2.3/x.css" } to origins to clear this refusal',
      },
    })
  })

  test('path refusal advice falls back to an unscoped approval when the first segment is unreadable', () => {
    const url = 'https://cdn.jsdelivr.net/a;b/x.css'
    const decision = originDecision(url, 'style', [{ origin: 'https://cdn.jsdelivr.net', kinds: ['style'], pathname: '/fontsource' }], true)
    expect(decision.allowed).toBe(false)
    if (decision.allowed) return
    expect(decision.refusal.reason).toBe('outside-approved-path')
    expect(decision.refusal.advice).toBe('add { origin: "https://cdn.jsdelivr.net", kinds: ["style"] } to origins to clear this refusal')
    expect(originDecision(url, 'style', [{ origin: 'https://cdn.jsdelivr.net', kinds: ['style'] }], true).allowed).toBe(true)
  })

  test('path refusal advice stops before the first unreadable segment', () => {
    const decision = originDecision(
      'https://cdn.jsdelivr.net/npm/x@1.2.3/a;b.css',
      'style',
      [{ origin: 'https://cdn.jsdelivr.net', kinds: ['style'], pathname: '/fontsource' }],
      true,
    )
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.refusal.advice).toBe(
        'add { origin: "https://cdn.jsdelivr.net", kinds: ["style"], pathname: "/npm/x@1.2.3" } to origins to clear this refusal',
      )
    }
  })

  test('CSP sources carry both exact and descendant path forms', () => {
    const approvals: OriginApproval[] = [
      { origin: 'https://cdn.jsdelivr.net', kinds: ['style', 'font'], pathname: '/fontsource/' },
      { origin: 'https://assets.example', kinds: ['image'] },
    ]
    expect([...approvedSources(approvals, 'style', true)]).toEqual([
      'https://fonts.googleapis.com',
      'https://cdn.jsdelivr.net/fontsource/css',
      'https://cdn.jsdelivr.net/fontsource/css/',
      'https://cdn.jsdelivr.net/fontsource',
      'https://cdn.jsdelivr.net/fontsource/',
    ])
    expect([...approvedSources(approvals, 'font', true)]).toEqual([
      'https://fonts.gstatic.com',
      'https://cdn.jsdelivr.net/fontsource/fonts',
      'https://cdn.jsdelivr.net/fontsource/fonts/',
      'https://cdn.jsdelivr.net/fontsource',
      'https://cdn.jsdelivr.net/fontsource/',
    ])
    expect([...approvedSources(approvals, 'image', true)]).toEqual([...BUILT_IN_IMAGE_SOURCES, 'https://assets.example'])
  })

  test('approved origins include only unscoped approvals', () => {
    const approvals: OriginApproval[] = [{ origin: 'https://assets.example', kinds: ['image'], pathname: '/public' }]
    expect([...approvedOrigins(approvals, 'image', true)]).toEqual(BUILT_IN_IMAGE_SOURCES)
    expect([...approvedSources(approvals, 'image', true)]).toEqual([
      ...BUILT_IN_IMAGE_SOURCES,
      'https://assets.example/public',
      'https://assets.example/public/',
    ])
  })

  test('a prefixed approval does not narrow a built-in unscoped approval', () => {
    const approvals: OriginApproval[] = [{ origin: 'https://cdn.jsdelivr.net', kinds: ['script'], pathname: '/fontsource' }]
    expect(originDecision('https://cdn.jsdelivr.net/npm/x@1.2.3/x.js', 'script', approvals, true).allowed).toBe(true)
  })

  test('prefixed scripts still require exact versions', () => {
    const approvals: OriginApproval[] = [{ origin: 'https://cdn.jsdelivr.net', kinds: ['script'], pathname: '/npm' }]
    const decision = originDecision('https://cdn.jsdelivr.net/npm/example/index.js', 'script', approvals, true)
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.refusal.reason).toBe('unversioned-script')
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
