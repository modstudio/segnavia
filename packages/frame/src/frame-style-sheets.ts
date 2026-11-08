import type { StyleSheet } from '@segnavia/format'
import { compileStyleSheet } from '@segnavia/html'

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

export function frameStyleSheets(document: StyleSheet | undefined, baseCss = ''): string[] {
  const compiled = compileStyleSheet({ document: document ?? {}, baseCss: `${BLOCK_DIRECTION_CSS}${baseCss}` })
  if (!compiled.ok) throw new StyleSheetRefusedError(compiled.refusal)
  return compiled.sheets
}
