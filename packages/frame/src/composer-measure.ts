export function forcedPageBreak(value: string): boolean {
  return value === 'page' || value === 'left' || value === 'right' || value === 'recto' || value === 'verso'
}

export function composerLayoutReady(flow: Element | null): boolean {
  return Boolean(flow && flow.getClientRects().length > 0)
}

export function measurementRefusal(subject: string, missingFlows: readonly string[]): string {
  if (missingFlows.length > 0) {
    return `${subject} could not establish measured lines for source flows ${missingFlows.join(', ')}; allow every named flow to finish layout and yield a line to clear this refusal.`
  }
  return `${subject} could not measure line boxes or plan a page because the frame or galley has no size, or layout stayed deferred; give the frame and galley a non-zero size or allow layout to finish to clear this refusal.`
}

export function sizeFlowGalley(flow: HTMLElement, width: number, height: number, orphans: number, widows: number): void {
  flow.style.inlineSize = `${width}px`
  flow.style.setProperty('--segnavia-text-height', `${height}px`)
  flow.style.orphans = String(orphans)
  flow.style.widows = String(widows)
}

export function measureLineBoxes(element: Element, origin: number): Array<{ top: number; bottom: number }> {
  const tag = element.tagName.toLowerCase()
  if (tag === 'table') {
    return Array.from(element.querySelectorAll('tr'), (row) => {
      const box = row.getBoundingClientRect()
      return { top: box.top - origin, bottom: box.bottom - origin }
    })
  }
  if (tag === 'img' || tag === 'figure') {
    const box = element.getBoundingClientRect()
    return [{ top: box.top - origin, bottom: box.bottom - origin }]
  }
  const range = element.ownerDocument.createRange()
  range.selectNodeContents(element)
  const groups: Array<{ top: number; bottom: number }> = []
  for (const rect of range.getClientRects()) {
    const top = rect.top - origin
    const bottom = rect.bottom - origin
    const found = groups.find((group) => Math.abs(group.top - top) < 0.5)
    if (!found) groups.push({ top, bottom })
    else if (bottom > found.bottom) found.bottom = bottom
  }
  groups.sort((left, right) => left.top - right.top)
  if (groups.length > 0) return groups
  const box = element.getBoundingClientRect()
  return box.height > 0 ? [{ top: box.top - origin, bottom: box.bottom - origin }] : []
}
