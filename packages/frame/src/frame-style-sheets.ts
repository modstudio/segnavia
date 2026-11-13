import { cssVarInvalidMessage, type PreflightEntry, type PreflightProfile, Refusal, type StyleSheet } from '@segnavia/format'
import { type CssPreflightFinding, compileStyleSheet } from '@segnavia/html'
import { FIELD_BASE_CSS } from './field-style.ts'

// Blocks without an explicit direction read from their first strong letter,
// while :where() keeps the library default at zero specificity.
export const BLOCK_DIRECTION_CSS =
  ':where(:is(p,li,dt,dd,h1,h2,h3,h4,h5,h6,blockquote,figcaption,caption,td,th,summary,label,pre,div,section,article,aside,address):not([dir="ltr" i],[dir="rtl" i],[dir="auto" i])){unicode-bidi:plaintext}'

export class StyleSheetRefusedError extends Refusal {
  constructor(message: string) {
    super('style-sheet', message)
    this.name = 'StyleSheetRefusedError'
  }
}

export function cssPreflightEntries(findings: readonly CssPreflightFinding[]): PreflightEntry[] {
  return findings.map((finding) => ({
    ...finding,
    message:
      finding.check === 'css-var-invalid'
        ? cssVarInvalidMessage(finding.subject)
        : `CSS URL ${finding.subject} requires the network; replace it with an embedded or supplied asset to clear it.`,
  }))
}

export function frameStyleSheets(
  document: StyleSheet | undefined,
  brand: StyleSheet | undefined,
  baseCss = '',
  preflight?: { profile: PreflightProfile; entries: PreflightEntry[] },
): string[] {
  const findings: CssPreflightFinding[] | undefined = preflight ? [] : undefined
  const compiled = compileStyleSheet({ brand, document: document ?? {}, baseCss: `${FIELD_BASE_CSS}${BLOCK_DIRECTION_CSS}${baseCss}`, preflight: findings })
  if (!compiled.ok) throw new StyleSheetRefusedError(compiled.refusal)
  if (preflight && findings) preflight.entries.push(...cssPreflightEntries(findings).filter((entry) => preflight.profile[entry.check] !== 'off'))
  return compiled.sheets
}
