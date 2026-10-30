export type DependencyDecision = { allowed: true; origin: string } | { allowed: false; reason: string }

const PACKAGE_PATHS: Record<string, RegExp> = {
  'https://cdn.jsdelivr.net': /^\/npm\/(?:@[^/]+\/)?[^/@]+@(\d+\.\d+\.\d+)(?:\/|$)/,
  'https://unpkg.com': /^\/(?:@[^/]+\/)?[^/@]+@(\d+\.\d+\.\d+)(?:\/|$)/,
  'https://cdnjs.cloudflare.com': /^\/ajax\/libs\/[^/]+\/(\d+\.\d+\.\d+)(?:\/|$)/,
}

export function dependencyOriginSet(values: Iterable<string> | undefined): Set<string> {
  const result = new Set<string>()
  for (const value of values ?? []) {
    try {
      const url = new URL(value)
      if (url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash) result.add(url.origin.toLowerCase())
    } catch {}
  }
  return result
}

export function dependencyDecision(value: string, approved: Iterable<string> | undefined): DependencyDecision {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { allowed: false, reason: `${JSON.stringify(value)} is not an absolute https URL; an absolute URL at an approved origin clears this refusal` }
  }
  const origin = url.origin.toLowerCase()
  if (url.protocol !== 'https:' || !dependencyOriginSet(approved).has(origin)) {
    return { allowed: false, reason: `${url.href} is not at an approved dependency origin; add ${origin} to dependencyOrigins to clear this refusal` }
  }
  const shape = PACKAGE_PATHS[origin]
  if (shape && !shape.test(url.pathname)) {
    return { allowed: false, reason: `${url.href} does not name an exact x.y.z package version; use an exact version to clear this refusal` }
  }
  return { allowed: true, origin }
}
