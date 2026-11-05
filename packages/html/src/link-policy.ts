// An href on these elements is a link the reader follows. On any other
// element, an href is a resource the page fetches.
export const LINK_ELEMENTS = new Set(['a', 'area'])

/**
 * Governs hrefs on link elements (`a` and `area`) only. An href on any other
 * element is judged as a fetch: a same-document fragment or a safe data image.
 */
export interface LinkPolicy {
  // Absolute URL protocols a link may use.
  protocols: Iterable<string>
  // Origins that http(s) links may use.
  origins?: Iterable<string>
  // Whether fragment-only links are allowed; defaults to true.
  fragments?: boolean
}

export interface ResolvedLinkPolicy {
  protocols: ReadonlySet<string>
  origins?: Set<string>
  fragments: boolean
}

const FORBIDDEN_LINK_PROTOCOLS = new Set(['javascript:', 'vbscript:', 'data:'])

function normalizedProtocol(protocol: string): string {
  const normalized = protocol.toLowerCase()
  if (!/^[a-z][a-z\d+.-]*:$/.test(normalized)) {
    throw new TypeError(`links.protocols contains ${JSON.stringify(protocol)}; use URL protocols such as "https:" to clear this refusal`)
  }
  if (FORBIDDEN_LINK_PROTOCOLS.has(normalized)) {
    throw new TypeError(`links.protocols contains ${JSON.stringify(protocol)}; remove it from links.protocols to clear this refusal`)
  }
  return normalized
}

function normalizedOrigin(origin: string): string {
  try {
    const parsed = new URL(origin)
    if (parsed.origin !== 'null') return parsed.origin.toLowerCase()
  } catch {}
  throw new TypeError(`links.origins contains ${JSON.stringify(origin)}; use an absolute URL origin to clear this refusal`)
}

export function resolveLinkPolicy(policy: LinkPolicy): ResolvedLinkPolicy {
  return {
    protocols: new Set([...policy.protocols].map(normalizedProtocol)),
    origins: policy.origins === undefined ? undefined : new Set([...policy.origins].map(normalizedOrigin)),
    fragments: policy.fragments ?? true,
  }
}

export function defaultLinkPolicy(origins: Set<string>, fragments: boolean): ResolvedLinkPolicy {
  return { protocols: new Set(['https:']), origins, fragments }
}

// The URL parser removes tabs and newlines throughout and trims surrounding
// C0 controls and spaces, so the decision uses the raw value it navigates.
export function linkAllowed(value: string, policy: ResolvedLinkPolicy): boolean {
  let start = 0
  while (start < value.length && value.charCodeAt(start) <= 0x20) start += 1
  let end = value.length
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end -= 1
  const trimmed = value.slice(start, end)
  if (trimmed.startsWith('#')) return policy.fragments
  try {
    const parsed = new URL(value)
    if (FORBIDDEN_LINK_PROTOCOLS.has(parsed.protocol) || !policy.protocols.has(parsed.protocol)) return false
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true
    return policy.origins === undefined || policy.origins.has(parsed.origin.toLowerCase())
  } catch {
    return false
  }
}
