export interface CssRemovedUnit {
  label: string
  source: string
}

export interface CssSanitizeResult {
  css: string
  removed: CssRemovedUnit[]
}

export function recordCssRemoved(removed: CssRemovedUnit[], labels: readonly string[], source: string): void {
  for (const label of labels) removed.push({ label, source })
}
