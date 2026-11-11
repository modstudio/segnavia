const FITTED_SLOT_MODES = new Set(['shrink', 'truncate', 'refuse'])

/** Whether filled HTML contains a slot whose overflow the bridge must fit. */
export function documentNeedsSlotFit(html: string): boolean {
  const marker = /\bdata-slot-overflow\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi
  for (const match of html.matchAll(marker)) {
    const value = match[1] ?? match[2] ?? match[3] ?? ''
    if (FITTED_SLOT_MODES.has(value.split(':')[1] ?? '')) return true
  }
  return false
}
