export interface LinkPolicy {
  protocols: Iterable<string>
  origins?: Iterable<string>
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

// Browsers ignore controls and whitespace inside a scheme, so the decision
// judges the same normalized spelling that navigation uses.
export function linkAllowed(value: string, policy: ResolvedLinkPolicy): boolean {
  const normalized = [...value]
    .filter((character) => character.charCodeAt(0) > 0x20 && character.charCodeAt(0) !== 0x7f)
    .join('')
    .toLowerCase()
  if (normalized.startsWith('#')) return policy.fragments
  try {
    const parsed = new URL(normalized)
    if (FORBIDDEN_LINK_PROTOCOLS.has(parsed.protocol) || !policy.protocols.has(parsed.protocol)) return false
    return policy.origins === undefined || parsed.origin === 'null' || policy.origins.has(parsed.origin.toLowerCase())
  } catch {
    return false
  }
}
