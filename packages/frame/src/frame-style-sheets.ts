import type { PreflightEntry, PreflightProfile, StyleSheet } from '@segnavia/format'
import { compileStyleSheet, type CssPreflightFinding } from '@segnavia/html'

// Blocks without an explicit direction read from their first strong letter,
// while :where() keeps the library default at zero specificity.
export const BLOCK_DIRECTION_CSS =
  ':where(:is(p,li,dt,dd,h1,h2,h3,h4,h5,h6,blockquote,figcaption,caption,td,th,summary,label,pre,div,section,article,aside,address):not([dir="ltr" i],[dir="rtl" i],[dir="auto" i])){unicode-bidi:plaintext}'

export class StyleSheetRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StyleSheetRefusedError'
  }
}

export function cssPreflightEntries(findings: readonly CssPreflightFinding[]): PreflightEntry[] {
  return findings.map((finding) => ({
    ...finding,
    message:
      finding.check === 'css-var-invalid'
        ? `Custom property ${finding.subject} is invalid; define it or add a var() fallback to clear it.`
        : `CSS URL ${finding.subject} requires the network; replace it with an embedded or supplied asset to clear it.`,
  }))
}

export function frameStyleSheets(
  document: StyleSheet | undefined,
  brand: StyleSheet | undefined,
  baseCss = '',
  preflight?: { profile: PreflightProfile; entries: PreflightEntry[] },
): string[] {
  const findings: CssPreflightFinding[] = []
  const compiled = compileStyleSheet({ brand, document: document ?? {}, baseCss: `${BLOCK_DIRECTION_CSS}${baseCss}`, preflight: findings })
  if (!compiled.ok) throw new StyleSheetRefusedError(compiled.refusal)
  if (preflight) preflight.entries.push(...cssPreflightEntries(findings).filter((entry) => preflight.profile[entry.check] !== 'off'))
  return compiled.sheets
}
