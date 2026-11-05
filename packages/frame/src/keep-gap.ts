/** Return the unbreakable text used in place of an inline keep's gap. */
export function keepGap(text: string, whiteSpace: string): string {
  if (text.length === 0) return '\u2060'
  if (whiteSpace === 'pre' || whiteSpace === 'pre-wrap' || whiteSpace === 'break-spaces') return text.replace(/\s/g, '\u00a0')
  return '\u00a0'
}
