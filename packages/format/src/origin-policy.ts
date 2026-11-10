export type FetchKind = 'script' | 'style' | 'font' | 'image'
export const FETCH_KINDS = ['script', 'style', 'font', 'image'] as const satisfies readonly FetchKind[]

export interface OriginApproval {
  origin: string
  kinds: readonly FetchKind[]
  pathname?: string
}

export type AssetRefusalReason = 'not-absolute' | 'unapproved-origin' | 'outside-approved-path' | 'unversioned-script' | 'scripts-off' | 'unreadable-srcset'

export interface AssetRefusal {
  url: string
  origin?: string
  kind: FetchKind
  reason: AssetRefusalReason
  message: string
  advice: string
}

export function assetRefusalText(refusal: AssetRefusal): string {
  return `${refusal.message}; ${refusal.advice}`
}

export function authoredOrigin(value: string | URL): string | undefined {
  try {
    const origin = (typeof value === 'string' ? new URL(value) : value).origin.toLowerCase()
    return origin === 'null' ? undefined : origin
  } catch {
    return undefined
  }
}

export type OriginDecision = { allowed: true; origin: string } | { allowed: false; refusal: AssetRefusal }

const VERSIONED_SCRIPT_PATHS: Record<string, RegExp> = {
  'https://cdn.jsdelivr.net': /^\/npm\/(?:@[^/]+\/)?[^/@]+@(\d+\.\d+\.\d+)(?:\/|$)/,
  'https://unpkg.com': /^\/(?:@[^/]+\/)?[^/@]+@(\d+\.\d+\.\d+)(?:\/|$)/,
  'https://cdnjs.cloudflare.com': /^\/ajax\/libs\/[^/]+\/(\d+\.\d+\.\d+)(?:\/|$)/,
  'https://cdn.tailwindcss.com': /^\/(\d+\.\d+\.\d+)(?:\/|$)/,
  'https://code.jquery.com': /^\/jquery-(\d+\.\d+\.\d+)(?:\.slim)?(?:\.min)?\.js$/,
}

export const DEFAULT_ORIGINS: readonly OriginApproval[] = [
  { origin: 'https://fonts.googleapis.com', kinds: ['style'] },
  { origin: 'https://fonts.gstatic.com', kinds: ['font'] },
  { origin: 'https://cdnjs.cloudflare.com', kinds: ['script'] },
  { origin: 'https://cdn.jsdelivr.net', kinds: ['script'] },
  { origin: 'https://unpkg.com', kinds: ['script'] },
  { origin: 'https://cdn.tailwindcss.com', kinds: ['script'] },
  { origin: 'https://code.jquery.com', kinds: ['script'] },
]

function readOrigins(values: Iterable<string> | undefined, bare: boolean): Set<string> {
  const result = new Set<string>()
  for (const value of values ?? []) {
    try {
      const url = new URL(value)
      const origin = authoredOrigin(url)
      if (origin && url.protocol === 'https:' && (!bare || (url.pathname === '/' && !url.search && !url.hash))) result.add(origin)
    } catch {}
  }
  return result
}

export function originSet(values: Iterable<string> | undefined): Set<string> {
  return readOrigins(values, false)
}

function strictOriginSet(values: Iterable<string> | undefined): Set<string> {
  return readOrigins(values, true)
}

interface ReadableApproval {
  origin: string
  kinds: readonly FetchKind[]
  pathname?: string
}

function readablePathname(value: string): string | undefined {
  if (!value.startsWith('/') || /[?#;,\\]/.test(value) || /%(?:2e|2f|5c)/i.test(value)) return undefined
  if (value.split('/').some((segment) => segment === '.' || segment === '..')) return undefined
  return value === '/' ? value : value.replace(/\/+$/, '')
}

function readableApprovals(approvals: Iterable<OriginApproval> | undefined): ReadableApproval[] {
  const result: ReadableApproval[] = []
  for (const approval of [...DEFAULT_ORIGINS, ...(approvals ?? [])]) {
    const origin = [...strictOriginSet([approval.origin])][0]
    if (!origin) continue
    if (approval.pathname === undefined) {
      result.push({ origin, kinds: approval.kinds })
      continue
    }
    const pathname = readablePathname(approval.pathname)
    if (pathname) result.push({ origin, kinds: approval.kinds, pathname })
  }
  return result
}

function approvalsFor(approvals: Iterable<OriginApproval> | undefined, kind: FetchKind, scripts: boolean): ReadableApproval[] {
  if (kind === 'script' && !scripts) return []
  return readableApprovals(approvals).filter((approval) => approval.kinds.includes(kind))
}

export function approvedOrigins(approvals: Iterable<OriginApproval> | undefined, kind: FetchKind, scripts: boolean): Set<string> {
  return new Set(approvalsFor(approvals, kind, scripts).map((approval) => approval.origin))
}

export function approvedSources(approvals: Iterable<OriginApproval> | undefined, kind: FetchKind, scripts: boolean): Set<string> {
  const result = new Set<string>()
  for (const approval of approvalsFor(approvals, kind, scripts)) {
    if (approval.pathname === undefined) {
      result.add(approval.origin)
      continue
    }
    if (approval.pathname === '/') {
      result.add(approval.origin)
      continue
    }
    const source = `${approval.origin}${approval.pathname}`
    result.add(source)
    result.add(`${source}/`)
  }
  return result
}

function pathRefusal(value: string, url: URL, origin: string, kind: FetchKind, candidates: ReadableApproval[]): AssetRefusal | undefined {
  if (candidates.some((approval) => approval.pathname === undefined)) return undefined
  const prefixes = candidates.flatMap((approval) => (approval.pathname === undefined ? [] : [approval.pathname]))
  const separator = url.pathname.match(/%(?:2f|5c)/i)?.[0]
  const matches = prefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix === '/' ? '/' : `${prefix}/`))
  if (!separator && matches) return undefined
  return {
    url: value,
    origin,
    kind,
    reason: 'outside-approved-path',
    message: separator
      ? `${url.href} contains encoded path separator ${separator}`
      : `${url.href} is outside the approved ${kind} path prefixes at ${origin}: ${prefixes.map((prefix) => JSON.stringify(prefix)).join(', ')}`,
    advice: separator
      ? 'use literal path separators instead of encoded separators to clear this refusal'
      : `add { origin: ${JSON.stringify(origin)}, kinds: [${JSON.stringify(kind)}], pathname: ${JSON.stringify(url.pathname)} } to origins to clear this refusal`,
  }
}

export function originDecision(value: string, kind: FetchKind, approvals: Iterable<OriginApproval> | undefined, scripts: boolean): OriginDecision {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return {
      allowed: false,
      refusal: {
        url: value,
        kind,
        reason: 'not-absolute',
        message: `${JSON.stringify(value)} is not an absolute https URL`,
        advice: 'an absolute URL at an approved origin clears this refusal',
      },
    }
  }
  const origin = authoredOrigin(url)
  const candidates = origin ? approvalsFor(approvals, kind, scripts).filter((approval) => approval.origin === origin) : []
  if (!origin || url.protocol !== 'https:' || candidates.length === 0) {
    return {
      allowed: false,
      refusal: {
        url: value,
        ...(origin === undefined ? {} : { origin }),
        kind,
        reason: 'unapproved-origin',
        message: origin ? `${url.href} at origin ${origin} is not approved for ${kind}` : `${url.href} has no origin approved for ${kind}`,
        advice: origin
          ? `add { origin: ${JSON.stringify(origin)}, kinds: [${JSON.stringify(kind)}] } to origins to clear this refusal`
          : 'use an absolute https URL at an approved origin to clear this refusal',
      },
    }
  }
  const outsidePath = pathRefusal(value, url, origin, kind, candidates)
  if (outsidePath) return { allowed: false, refusal: outsidePath }
  const shape = kind === 'script' ? VERSIONED_SCRIPT_PATHS[origin] : undefined
  if (shape && !shape.test(url.pathname)) {
    return {
      allowed: false,
      refusal: {
        url: value,
        origin,
        kind,
        reason: 'unversioned-script',
        message: `${url.href} does not name an exact x.y.z package version`,
        advice: 'use an exact version to clear this refusal',
      },
    }
  }
  return { allowed: true, origin }
}
