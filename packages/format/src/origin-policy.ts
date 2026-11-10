export type FetchKind = 'script' | 'style' | 'font' | 'image'
export const FETCH_KINDS = ['script', 'style', 'font', 'image'] as const satisfies readonly FetchKind[]

export interface OriginApproval {
  origin: string
  kinds: readonly FetchKind[]
}

export type AssetRefusalReason = 'not-absolute' | 'unapproved-origin' | 'unversioned-script' | 'scripts-off' | 'unreadable-srcset'

export interface AssetRefusal {
  url: string
  origin?: string
  kind: FetchKind
  reason: AssetRefusalReason
  message: string
  advice: string
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
      if (url.protocol === 'https:' && (!bare || (url.pathname === '/' && !url.search && !url.hash))) result.add(url.origin.toLowerCase())
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

export function approvedOrigins(approvals: Iterable<OriginApproval> | undefined, kind: FetchKind, scripts: boolean): Set<string> {
  const result = new Set<string>()
  if (kind === 'script' && !scripts) return result
  for (const approval of [...DEFAULT_ORIGINS, ...(approvals ?? [])]) {
    if (!approval.kinds.includes(kind)) continue
    const origins = strictOriginSet([approval.origin])
    for (const origin of origins) result.add(origin)
  }
  return result
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
  const origin = url.origin.toLowerCase()
  if (url.protocol !== 'https:' || !approvedOrigins(approvals, kind, scripts).has(origin)) {
    return {
      allowed: false,
      refusal: {
        url: value,
        origin,
        kind,
        reason: 'unapproved-origin',
        message: `${url.href} at origin ${origin} is not approved for ${kind}`,
        advice: `add { origin: ${JSON.stringify(origin)}, kinds: [${JSON.stringify(kind)}] } to origins to clear this refusal`,
      },
    }
  }
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
